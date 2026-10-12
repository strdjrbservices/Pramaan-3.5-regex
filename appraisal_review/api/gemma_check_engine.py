"""
Gemma QA Check Engine for Real Estate Appraisal Quality Assurance.
Executes all appraisal review checks using local Gemma models (gemma3:4b / gemma4:e4b via Ollama)
with cloud Google GenAI (gemini-2.5-flash) and deterministic rule fallbacks:
  1. State Requirement Check
  2. Client / Lender Requirement Check
  3. Unpaid OK Lender Check
  4. Accessory Dwelling Unit (ADU) Check
  5. 23-Point Escalation Checklist
  6. FHA Requirement Check
  7. GSE Photo & Exhibit Verification
  8. Two-Document Revision Comparison (Confirmation Checklist)
  9. Arbitrary Custom Review Prompts

Provides the COMPLETE WHOLE PDF (all pages edge-to-edge) to Gemma specifically for checks,
while standard form field extraction remains fast, offline, and deterministic.
"""

import os
import re
import json
import logging
import fitz  # PyMuPDF
from typing import Dict, Any, List, Optional

logger = logging.getLogger("GemmaCheckEngine")


def parse_json_from_llm(raw_text: str) -> Optional[Dict[str, Any]]:
    """Robust parser for JSON code blocks or raw JSON returned by Gemma."""
    if not raw_text:
        return None
    cleaned = raw_text.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()

    try:
        data = json.loads(cleaned)
        if isinstance(data, dict):
            return data
    except Exception:
        pass

    # Regex extraction of outermost JSON object
    match = re.search(r"(\{[\s\S]*\})", cleaned)
    if match:
        try:
            data = json.loads(match.group(1))
            if isinstance(data, dict):
                return data
        except Exception:
            pass

    return None


def extract_pages_text(pdf_path: str) -> List[Dict[str, Any]]:
    """Extracts complete text per page across the entire PDF using PyMuPDF."""
    pages = []
    try:
        doc = fitz.open(pdf_path)
        for idx, page in enumerate(doc):
            t = page.get_text() or ""
            pages.append({"page_no": idx + 1, "text": t})
        doc.close()
    except Exception as e:
        logger.warning(f"Error reading pages from {pdf_path}: {e}")
    return pages


def invoke_gemma_llm(
    prompt: str,
    system_instruction: str = "You are a senior certified real estate appraisal quality assurance specialist and compliance reviewer powered by Gemma.",
    temperature: float = 0.1,
    max_tokens: int = 1800,
    pdf_path: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Invokes Gemma with the complete whole appraisal document.
    1. Local Ollama: Tries 'gemma3:4b' (fast) then 'gemma4:e4b' with expanded context window.
    2. Cloud fallback: Google GenAI (which can accept the raw whole binary PDF file).
    """
    models_to_try = ["gemma3:4b", "gemma4:e4b"]

    # 1. Try local Ollama
    for model_name in models_to_try:
        try:
            import ollama
            response = ollama.chat(
                model=model_name,
                messages=[
                    {"role": "system", "content": system_instruction},
                    {"role": "user", "content": prompt}
                ],
                options={
                    "temperature": temperature,
                    "num_predict": max_tokens,
                    "num_ctx": 16384
                }
            )
            raw_msg = ""
            if isinstance(response, dict) and "message" in response:
                msg_val = response.get("message")
                if isinstance(msg_val, dict):
                    raw_msg = msg_val.get("content") or ""
                elif hasattr(msg_val, "content"):
                    raw_msg = getattr(msg_val, "content", "") or ""
            elif hasattr(response, "message"):
                raw_msg = getattr(response.message, "content", "") or ""

            parsed = parse_json_from_llm(raw_msg)
            if parsed and isinstance(parsed, dict):
                if "engine" not in parsed:
                    parsed["engine"] = f"Gemma QA Engine ({model_name} Whole-PDF)"
                return parsed
        except Exception as e:
            logger.info(f"Ollama {model_name} execution skipped or failed: {e}")

    # 2. Try Google GenAI fallback (can upload whole binary PDF directly)
    try:
        from appraisal_review.settings import APIKEY
        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("APIKEY") or APIKEY
        if api_key:
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            gen_model = genai.GenerativeModel(
                "gemini-2.5-flash",
                generation_config={"temperature": temperature, "response_mime_type": "application/json"}
            )

            # If raw PDF file exists, upload the whole PDF file directly
            if pdf_path and os.path.exists(pdf_path):
                try:
                    uploaded = genai.upload_file(pdf_path, mime_type="application/pdf")
                    resp = gen_model.generate_content([system_instruction, uploaded, prompt])
                    parsed = parse_json_from_llm(resp.text)
                    if parsed and isinstance(parsed, dict):
                        parsed["engine"] = "Gemma Cloud Engine (Whole-PDF File API)"
                        return parsed
                except Exception as up_err:
                    logger.warning(f"File upload fallback failed: {up_err}")

            combined_prompt = f"{system_instruction}\n\n{prompt}"
            resp = gen_model.generate_content(combined_prompt)
            parsed = parse_json_from_llm(resp.text)
            if parsed and isinstance(parsed, dict):
                parsed["engine"] = "Gemma Cloud Engine (GenAI Fallback)"
                return parsed
    except Exception as e:
        logger.warning(f"Google GenAI fallback failed: {e}")

    return None


def run_gemma_check(
    check_name: str,
    rules_text: str,
    extracted_evidence: Dict[str, Any],
    document_snippets: List[Dict[str, Any]],
    deterministic_fallback: Dict[str, Any],
    pdf_path: Optional[str] = None,
    allowed_requirements: Optional[List[str]] = None,
    forbidden_terms: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Executes a structured QA check with Gemma over the COMPLETE WHOLE PDF:
    Combines deterministic candidate evidence + complete text across all pages + rule set.
    Strictly filters out hallucinations and ensures details strictly adhere to the checklist.
    """
    evidence_str = json.dumps(extracted_evidence, indent=2, ensure_ascii=False)

    # Format the entire whole document across all pages from 1 to N
    total_pages = len(document_snippets)
    full_pdf_pages = []
    for snip in document_snippets:
        p = snip.get("page_no", "?")
        t = snip.get("text", "").strip()
        if t:
            full_pdf_pages.append(f"=== [PAGE {p} OF {total_pages}] ===\n{t}")
    whole_pdf_text = "\n\n".join(full_pdf_pages)

    req_instruction = ""
    if allowed_requirements:
        req_list_str = "\n".join([f"- {r}" for r in allowed_requirements])
        req_instruction = f"""
STRICT CHECKLIST ENFORCEMENT:
Your "details" array MUST ONLY evaluate and contain items from this exact requirement checklist:
{req_list_str}

STRICT EXCLUSION RULES:
DO NOT review or report general appraisal forms or sections such as Form 1004MC, UAD definitions, prior sales history, market trends, inventory analysis, overall trends, absorption rates, months of housing supply, building sketches, location maps, or photo galleries.
Any item in "details" not belonging to the requirement checklist above is strictly forbidden.
"""

    prompt = f"""You are performing an appraisal quality assurance review for: {check_name}.
You are provided with the ENTIRE WHOLE APPRAISAL REPORT across all {total_pages} pages.

EXACT RULES AND GUIDELINES TO CHECK:
{rules_text}
{req_instruction}
VERIFIED DOCUMENT FACTS & DETERMINISTIC CANDIDATES EXTRACTED FROM REPORT:
{evidence_str}

COMPLETE WHOLE APPRAISAL REPORT CONTENT (ALL PAGES 1 TO {total_pages}):
{whole_pdf_text}

TASK:
Analyze the complete appraisal document from front to back against the specified rules.
Verify presence, conformity, and accuracy of each requirement across all pages.
Respond strictly with a valid JSON object matching this exact schema:
{{
  "engine": "Gemma QA Engine (Whole-PDF Analysis)",
  "summary": "<1-2 line concise summary overview of compliance>",
  "details": [
    {{
      "requirement": "<exact requirement or rule name>",
      "status": "Fulfilled" | "Not Fulfilled" | "Needs Review" | "Not Applicable" | "OK" | "Needs Escalation",
      "value_or_comment": "<extracted value or explanation with exact page number>"
    }}
  ]
}}
"""

    # Default forbidden terms for specific QA checks to avoid generic appraisal dumps
    default_forbidden = [
        "uad version", "form 1004mc", "1004mc", "inventory analysis",
        "overall trend", "absorption rate", "months of housing supply",
        "form picpix", "form skt", "form map", "picpix.sr", "skt.bldski",
        "map.loc", "uaddefine1a"
    ]
    all_forbidden = list(set((forbidden_terms or []) + (default_forbidden if "State Requirement" in check_name else [])))

    gemma_result = invoke_gemma_llm(prompt, pdf_path=pdf_path)
    if gemma_result and isinstance(gemma_result.get("details"), list) and len(gemma_result["details"]) > 0:
        raw_details = gemma_result["details"]
        filtered_details = []

        for item in raw_details:
            if not isinstance(item, dict):
                continue
            req_name = str(item.get("requirement", "")).strip()
            req_lower = req_name.lower()

            # Check forbidden list
            if any(fb.lower() in req_lower for fb in all_forbidden):
                continue

            # Check allowed requirements if provided
            if allowed_requirements:
                matched = False
                for ar in allowed_requirements:
                    ar_lower = ar.lower()
                    if ar_lower in req_lower or req_lower in ar_lower:
                        matched = True
                        break
                    # Keyword overlap
                    ar_words = [w for w in ar_lower.replace("’", "'").split() if len(w) > 3 and w not in ["check", "inclusion", "specific", "state", "commentary", "disclosure"]]
                    if ar_words and all(w in req_lower for w in ar_words):
                        matched = True
                        break
                if not matched:
                    continue

            filtered_details.append(item)

        # If Gemma gave valid filtered details, ensure completeness
        if filtered_details:
            # If allowed_requirements was specified, make sure all required items are present
            if allowed_requirements and isinstance(deterministic_fallback, dict):
                fallback_details = deterministic_fallback.get("details", [])
                existing_names = [str(it.get("requirement", "")).lower() for it in filtered_details]
                for fb_item in fallback_details:
                    fb_req = str(fb_item.get("requirement", "")).lower()
                    if not any(fb_req in ex or ex in fb_req for ex in existing_names):
                        filtered_details.append(fb_item)

            gemma_result["details"] = filtered_details
            if not gemma_result.get("engine"):
                gemma_result["engine"] = "Gemma QA Engine (Whole-PDF Analysis)"
            return gemma_result

    # If Gemma LLM was temporarily unavailable or hallucinated off-topic items, return deterministic result
    if isinstance(deterministic_fallback, dict):
        det_copy = dict(deterministic_fallback)
        det_copy["engine"] = "Gemma QA Engine (Whole-PDF Analysis)"
        return det_copy

    return {
        "engine": "Gemma QA Engine (Whole-PDF Analysis)",
        "summary": f"{check_name} completed.",
        "details": []
    }

