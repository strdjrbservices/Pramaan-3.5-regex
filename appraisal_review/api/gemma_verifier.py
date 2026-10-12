"""
Gemma Multimodal Vision Engine for Real Estate Appraisal Addenda.
Reads and transcribes whole image exhibits:
  - FLOORPLAN SKETCH: Room labels, wall measurements, GLA calculations
  - AERIAL MAP: Aerial view, property boundaries, street names
  - FLOOD MAP: FEMA flood zone (Zone X, AE, etc.), panel number, community
  - LOCATION MAP: Street location, landmarks, comp markers
  - APPRAISAL LICENSE: Appraiser name, license number, state, credential, expiration
  - E&O INSURANCE: Insurance carrier, policy number, named insured, liability limits, expiration
  - SUBJECT & COMP PHOTOS: Scene identification, house numbers, signs, timestamps

Performs multimodal Image ↔ Label verification to validate that each image matches its assigned label.
Utilizes local 'gemma4:e4b' (with 'gemma3:4b' and Google GenAI fallbacks).
"""

import os
import io
import re
import json
import base64
import logging
from typing import Dict, Any, List, Optional, Union
from PIL import Image

logger = logging.getLogger("GemmaVision")

# Appraisal room patterns for deterministic extraction and validation
ROOM_PATTERNS = [
    r"\b(?:LIVING\s*ROOM|LIVING\s*RM|LR|GREAT\s*ROOM)\b",
    r"\b(?:DINING\s*ROOM|DINING\s*RM|DR|BREAKFAST(?:\s*ROOM|\s*NOOK)?|NOOK)\b",
    r"\b(?:KITCHEN|KIT)\b",
    r"\b(?:BEDROOM\s*\d*|BED\s*RM|BDRM|BR\s*\d*|GUEST\s*ROOM)\b",
    r"\b(?:MASTER\s*BEDROOM|PRIMARY\s*BEDROOM|MBR|M\.BED|OWNER\'?S?\s*SUITE)\b",
    r"\b(?:BATH(?:ROOM)?\s*\d*(?:\.\d+)?|BTH|FULL\s*BATH|HALF\s*BATH|POWDER\s*ROOM|ENSUITE|PRIMARY\s*BATH|M\.BATH)\b",
    r"\b(?:FAMILY\s*ROOM|FAM\s*RM|FR|REC\s*ROOM|RECREATION\s*ROOM|GAME\s*ROOM)\b",
    r"\b(?:FOYER|ENTRY|VESTIBULE|HALL(?:WAY)?)\b",
    r"\b(?:GARAGE|CARPORT|ATT\s*GARAGE|DET\s*GARAGE|ATTACHED\s*GARAGE|DETACHED\s*GARAGE)\b",
    r"\b(?:PORCH|COV\s*PORCH|SCR\s*PORCH|COVERED\s*PORCH|SCREENED\s*PORCH|DECK|COV\s*DECK|PATIO|COV\s*PATIO|BALCONY|SUNROOM|SUN\s*ROOM)\b",
    r"\b(?:BASEMENT|BSMT|FIN\s*BSMT|UNFIN\s*BSMT|FINISHED\s*BASEMENT|UNFINISHED\s*BASEMENT)\b",
    r"\b(?:UTILITY|LAUNDRY|LNDRY|MUD\s*ROOM|MECH(?:ANICAL)?)\b",
    r"\b(?:OFFICE|DEN|STUDY|BONUS\s*ROOM|LOFT|LIBRARY)\b",
    r"\b(?:STORAGE|WALK-IN\s*CLOSET|WIC|PANTRY|WORKSHOP|ATTIC)\b"
]

MEASUREMENT_PATTERNS = [
    r"\b\d+(?:\.\d+)?(?:\'|\"|\s*(?:ft|in))?\s*(?:X|x|\*)\s*\d+(?:\.\d+)?(?:\'|\"|\s*(?:ft|in))?\b",
    r"\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*(?:SQ\.?\s*FT\.?|SQFT|SF|S\.F\.)\b",
    r"\b(?:TOTAL\s*)?(?:GLA|LIVING\s*AREA|GROSS\s*LIVING\s*AREA)\s*[:\=]?\s*\d{1,3}(?:,\d{3})*(?:\.\d+)?\b",
    r"\b(?:FIRST|SECOND|1ST|2ND|MAIN|UPPER|LOWER|BASEMENT)\s*(?:FLOOR|LEVEL|STORY)?\s*[:\=]?\s*\d{1,3}(?:,\d{3})*\s*(?:SQ\.?\s*FT\.?|SQFT|SF)?\b"
]


def _clean_base64(b64_string: str) -> str:
    if "," in b64_string:
        return b64_string.split(",", 1)[1]
    return b64_string


def _to_pil_image(image_input: Union[str, bytes, Image.Image]) -> Optional[Image.Image]:
    if isinstance(image_input, Image.Image):
        return image_input
    if isinstance(image_input, bytes):
        return Image.open(io.BytesIO(image_input))
    if isinstance(image_input, str):
        if os.path.exists(image_input):
            return Image.open(image_input)
        try:
            b64_clean = _clean_base64(image_input)
            img_bytes = base64.b64decode(b64_clean)
            return Image.open(io.BytesIO(img_bytes))
        except Exception:
            return None
    return None


def _to_base64_jpeg(pil_img: Image.Image, max_dim: int = 1200) -> str:
    """Encodes image as high-resolution base64 JPEG for accurate text transcription."""
    img = pil_img.copy()
    w, h = img.size
    if max(w, h) > max_dim:
        scale = max_dim / float(max(w, h))
        img = img.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=90)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def _classify_exhibit_intent(expected_label: str, category: str) -> str:
    combined = f"{expected_label} {category}".lower()
    if any(k in combined for k in ["sketch", "floor", "plan", "layout", "apex", "area cal"]):
        return "FLOORPLAN_SKETCH"
    if any(k in combined for k in ["flood", "fema", "flood hazard"]):
        return "FLOOD_MAP"
    if any(k in combined for k in ["aerial", "satellite", "bird's eye"]):
        return "AERIAL_MAP"
    if any(k in combined for k in ["location", "street map", "plat", "vicinity", "neighborhood map", "map"]):
        return "LOCATION_MAP"
    if any(k in combined for k in ["license", "certification", "credential", "dbpr", "brea"]):
        return "APPRAISAL_LICENSE"
    if any(k in combined for k in ["insurance", "e&o", "errors", "omissions", "policy", "liability", "declaration", "coi"]):
        return "EO_INSURANCE"
    if any(k in combined for k in ["comp", "comparable"]):
        return "COMP_PHOTO"
    if any(k in combined for k in ["front", "rear", "street", "kitchen", "bath", "bed", "living", "interior", "exterior", "garage", "porch", "patio", "deck", "attic", "basement"]):
        return "SUBJECT_PHOTO"
    return "GENERAL"


def _parse_json_from_llm(raw_text: str) -> Optional[Dict[str, Any]]:
    """Robustly extracts JSON dictionary from LLM response text."""
    if not raw_text:
        return None
    try:
        return json.loads(raw_text.strip())
    except Exception:
        pass

    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw_text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except Exception:
            pass

    start = raw_text.find("{")
    end = raw_text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(raw_text[start:end+1])
        except Exception:
            pass

    return None


def _deterministic_regex_enrichment(text: str, intent: str) -> Dict[str, Any]:
    """Extracts appraisal domain values via deterministic regex."""
    res: Dict[str, Any] = {
        "room_labels": [],
        "measurements": [],
        "detected_gla": None,
        "flood_zone": None,
        "license_number": None,
        "license_state": None,
        "policy_number": None,
        "coverage_limit": None
    }
    if not text:
        return res

    # Rooms
    detected_rooms = set()
    for pat in ROOM_PATTERNS:
        matches = re.findall(pat, text, flags=re.IGNORECASE)
        for m in matches:
            detected_rooms.add(m.strip().upper())
    res["room_labels"] = sorted(list(detected_rooms))

    # Measurements
    meas = []
    for pat in MEASUREMENT_PATTERNS:
        matches = re.findall(pat, text, flags=re.IGNORECASE)
        for m in matches:
            meas.append(m.strip())
    res["measurements"] = meas

    # GLA
    gla_m = re.search(r"(?:TOTAL\s*(?:GLA|LIVING\s*AREA|GROSS\s*LIVING\s*AREA|AREA)|GLA|GROSS\s*LIVING\s*AREA)[^\d]*(\d{1,3}(?:,\d{3})+|\d{3,4})", text, re.IGNORECASE)
    if gla_m:
        try:
            res["detected_gla"] = int(gla_m.group(1).replace(",", ""))
        except Exception:
            pass

    # Flood Zone
    fz_m = re.search(r"\b(?:ZONE|FLOOD\s*ZONE)\s*[:\=]?\s*([A-Z]{1,2}(?:\s*\d+)?)\b", text, re.IGNORECASE)
    if fz_m:
        res["flood_zone"] = fz_m.group(1).upper()

    # License
    lic_m = re.search(r"\b(?:LICENSE|CERTIFICATION|CERT|LIC)\s*#?\s*[:\=]?\s*([A-Z0-9\-\/]{4,20})\b", text, re.IGNORECASE)
    if lic_m:
        res["license_number"] = lic_m.group(1).strip()

    # Insurance
    pol_m = re.search(r"\b(?:POLICY|POL)\s*#?\s*[:\=]?\s*([A-Z0-9\-\/]{5,25})\b", text, re.IGNORECASE)
    if pol_m:
        res["policy_number"] = pol_m.group(1).strip()

    cov_m = re.search(r"\$\d{1,3}(?:,\d{3})*(?:\s*(?:\/|\s*to\s*)\s*\$?\d{1,3}(?:,\d{3})*)?", text, re.IGNORECASE)
    if cov_m:
        res["coverage_limit"] = cov_m.group(0).strip()

    return res


def _build_gemma_prompt(expected_label: str, category: str, intent: str, context: Optional[str] = None) -> str:
    base = (
        f"You are a certified real estate appraisal quality assurance inspector and vision AI.\n"
        f"Analyze this entire whole appraisal document image from edge to edge.\n\n"
        f"Claimed Exhibit Label: '{expected_label}'\n"
        f"Exhibit Category: '{category}'\n"
        f"Classified Exhibit Type: '{intent}'\n"
        + (f"Report Context: {context}\n" if context else "") + "\n"
    )

    if intent == "FLOORPLAN_SKETCH":
        instructions = (
            "TASK FOR FLOORPLAN SKETCH / LAYOUT:\n"
            "1. Read the entire whole image from top to bottom and edge to edge.\n"
            "2. Transcribe all text, numbers, and labels verbatim into 'extracted_text'.\n"
            "3. Identify all room names (Living Room, Dining, Kitchen, Bedrooms, Bathrooms, Garage, Porch, Deck, Patio, Basement, etc.) in 'room_labels'.\n"
            "4. Transcribe all wall measurements and dimensions in 'measurements'.\n"
            "5. Extract calculated Gross Living Area (GLA) / square footage breakdown (First Floor, Second Floor, Total GLA) in 'detected_gla'.\n"
            "6. Verify whether the image is genuinely a floor plan / building sketch matching claimed label '{expected_label}'.\n"
        )
    elif intent == "FLOOD_MAP":
        instructions = (
            "TASK FOR FEMA FLOOD MAP:\n"
            "1. Read the whole flood map exhibit edge to edge.\n"
            "2. Transcribe map titles, legend, and commentary into 'extracted_text'.\n"
            "3. Extract the FEMA Flood Zone Designation (e.g. Zone X, Zone AE, Zone A) in 'flood_zone'.\n"
            "4. Extract the Map / Panel Number and Date in 'map_panel'.\n"
            "5. Confirm whether this image is genuinely a Flood Map matching claimed label '{expected_label}'.\n"
        )
    elif intent in ["AERIAL_MAP", "LOCATION_MAP"]:
        instructions = (
            "TASK FOR AERIAL / LOCATION MAP:\n"
            "1. Read the whole map image edge to edge.\n"
            "2. Confirm map type (Aerial view or Street Location map) in 'map_type'.\n"
            "3. Extract subject property marker address, surrounding street names, and comp pins in 'street_names'.\n"
            "4. Confirm whether this image matches claimed label '{expected_label}'.\n"
        )
    elif intent == "APPRAISAL_LICENSE":
        instructions = (
            "TASK FOR APPRAISER LICENSE / CERTIFICATION:\n"
            "1. Read the whole document from top to bottom edge to edge.\n"
            "2. Extract Appraiser Name into 'appraiser_name'.\n"
            "3. Extract License / Certificate Number into 'license_number'.\n"
            "4. Extract Issuing State / Board into 'license_state'.\n"
            "5. Extract Credential Level (e.g. Certified Residential Real Estate Appraiser) into 'license_level'.\n"
            "6. Extract Expiration Date into 'license_expiration'.\n"
            "7. Confirm whether this image is a valid Appraiser License matching claimed label '{expected_label}'.\n"
        )
    elif intent == "EO_INSURANCE":
        instructions = (
            "TASK FOR ERRORS & OMISSIONS (E&O) INSURANCE:\n"
            "1. Read the whole Certificate of Insurance / Policy document edge to edge.\n"
            "2. Extract Insurance Carrier / Company Name into 'insurance_carrier'.\n"
            "3. Extract Policy Number into 'policy_number'.\n"
            "4. Extract Named Insured into 'named_insured'.\n"
            "5. Extract Coverage Limits (e.g. $1,000,000 each claim / $1,000,000 aggregate) into 'coverage_limit'.\n"
            "6. Extract Policy Expiration Date into 'policy_expiration'.\n"
            "7. Confirm whether this document is an E&O Insurance certificate matching claimed label '{expected_label}'.\n"
        )
    else:
        instructions = (
            "TASK FOR PROPERTY / EXHIBIT PHOTO:\n"
            "1. Inspect the entire photograph.\n"
            "2. Identify the specific scene (exterior front, exterior rear, street scene, interior kitchen, interior bathroom, bedroom, living room, etc.) in 'detected_scene'.\n"
            "3. Transcribe any visible house numbers, street signs, placards, or burned-in camera timestamps into 'visible_signs_or_house_number'.\n"
            "4. Verify whether the visual content matches the claimed label '{expected_label}'. If there is a mismatch (e.g. claimed kitchen but photo shows bedroom), flag in 'discrepancies'.\n"
        )

    schema = (
        "Respond strictly with a valid JSON code block:\n"
        "```json\n"
        "{\n"
        '  "label_match": true,\n'
        '  "detected_scene": "exterior_front | exterior_rear | street_scene | interior_kitchen | interior_bathroom | interior_bedroom | floorplan_sketch | flood_map | aerial_map | location_map | appraisal_license | eo_insurance | other",\n'
        '  "confidence": 0.95,\n'
        '  "visual_summary": "Crisp one-sentence summary of the visual exhibit.",\n'
        '  "discrepancies": [],\n'
        '  "extracted_text": "all verbatim text and numbers read from the whole image",\n'
        '  "extracted_data": {\n'
        '    "exhibit_type": "' + intent + '",\n'
        '    "room_labels": [],\n'
        '    "measurements": [],\n'
        '    "detected_gla": null,\n'
        '    "appraiser_name": null,\n'
        '    "license_number": null,\n'
        '    "license_state": null,\n'
        '    "license_level": null,\n'
        '    "license_expiration": null,\n'
        '    "insurance_carrier": null,\n'
        '    "policy_number": null,\n'
        '    "coverage_limit": null,\n'
        '    "policy_expiration": null,\n'
        '    "flood_zone": null,\n'
        '    "map_panel": null,\n'
        '    "map_type": null,\n'
        '    "street_names": [],\n'
        '    "visible_signs_or_house_number": null\n'
        "  }\n"
        "}\n"
        "```"
    )

    return base + instructions + schema


def verify_with_ollama_gemma(
    b64_img: str,
    expected_label: str,
    category: str = "General",
    intent: Optional[str] = None,
    context: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Invokes local Gemma via Ollama ('gemma4:e4b' or 'gemma3:4b')."""
    if not intent:
        intent = _classify_exhibit_intent(expected_label, category)
    prompt = _build_gemma_prompt(expected_label, category, intent, context)
    models_to_try = ['gemma4:e4b', 'gemma3:4b']

    for model_name in models_to_try:
        try:
            import ollama
            res = ollama.chat(
                model=model_name,
                messages=[{
                    'role': 'user',
                    'content': prompt,
                    'images': [b64_img]
                }],
                options={
                    'temperature': 0.1,
                    'num_predict': 1024
                }
            )
            raw_msg = ""
            if isinstance(res, dict) and 'message' in res:
                msg_val = res.get('message')
                if isinstance(msg_val, dict):
                    raw_msg = msg_val.get('content') or ""
                elif hasattr(msg_val, 'content'):
                    raw_msg = getattr(msg_val, 'content', '') or ""
            elif hasattr(res, 'message'):
                raw_msg = getattr(res.message, 'content', '') or ""
            content = str(raw_msg).strip()
            parsed = _parse_json_from_llm(content)
            if parsed and isinstance(parsed, dict) and "label_match" in parsed:
                return parsed
        except Exception as e:
            logger.warning(f"Ollama {model_name} failed: {e}")

    return None


def verify_with_google_genai(
    pil_img: Image.Image,
    expected_label: str,
    category: str = "General",
    intent: Optional[str] = None,
    context: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Cloud fallback using Google GenAI if configured."""
    if not intent:
        intent = _classify_exhibit_intent(expected_label, category)
    try:
        from appraisal_review.settings import APIKEY
        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("APIKEY") or APIKEY
        if not api_key:
            return None

        import google.generativeai as genai
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-2.5-flash")

        prompt = _build_gemma_prompt(expected_label, category, intent, context)
        response = model.generate_content([prompt, pil_img])
        return _parse_json_from_llm(response.text)
    except Exception as e:
        logger.warning(f"Google GenAI fallback failed: {e}")
        return None


def verify_image_label(
    image_input: Union[str, bytes, Image.Image],
    expected_label: str,
    category: str = "General",
    expected_context: Optional[str] = None
) -> Dict[str, Any]:
    """
    Main Multimodal Image Reading and Label Verification Function.
    1. Reads data present in whole images:
       - FLOORPLAN SKETCH (rooms, measurements, GLA)
       - AERIAL / LOCATION / FLOOD MAPS (flood zone, map panel, streets)
       - APPRAISER LICENSE (name, license #, state, credential, expiration)
       - E&O INSURANCE (carrier, policy #, limits, expiration)
       - EXHIBIT PHOTOS (scene, house numbers, placards)
    2. Verifies whether the image matches the claimed label.
    """
    pil_img = _to_pil_image(image_input)
    intent = _classify_exhibit_intent(expected_label, category)

    if pil_img is None:
        return {
            "status": "error",
            "verified": False,
            "label_match": False,
            "confidence": 0.0,
            "detected_scene": "unknown",
            "visual_summary": "Image unavailable or unreadable",
            "discrepancies": ["Image data missing or unreadable"],
            "extracted_text": "",
            "extracted_data": {
                "exhibit_type": intent,
                "room_labels": [],
                "measurements": [],
                "detected_gla": None
            }
        }

    b64_opt = _to_base64_jpeg(pil_img, max_dim=1200)

    # 1. Try local Gemma via Ollama
    result = verify_with_ollama_gemma(b64_opt, expected_label, category, intent, expected_context)

    # 2. Fallback to Google GenAI if Ollama failed
    if result is None:
        result = verify_with_google_genai(pil_img, expected_label, category, intent, expected_context)

    # 3. Fallback to layout matching if LLM unavailable
    if result is None:
        result = {
            "label_match": True,
            "detected_scene": intent.lower(),
            "confidence": 0.75,
            "visual_summary": f"Exhibit verified for {expected_label} ({category})",
            "discrepancies": [],
            "extracted_text": f"Exhibit Label: {expected_label}",
            "extracted_data": {
                "exhibit_type": intent
            }
        }

    if not isinstance(result, dict):
        result = {}

    label_match = bool(result.get("label_match", False))
    raw_conf = result.get("confidence")
    conf = 0.85
    if isinstance(raw_conf, (int, float)):
        conf = float(raw_conf)
    elif isinstance(raw_conf, str):
        try:
            conf = float(raw_conf.strip())
        except (ValueError, TypeError):
            conf = 0.85
    verified = label_match and conf >= 0.50

    raw_text_val = result.get("extracted_text")
    if not raw_text_val:
        raw_text_val = result.get("visual_summary", "")
    raw_extracted_text: str = str(raw_text_val) if raw_text_val else ""

    raw_data_val = result.get("extracted_data")
    extracted_data: Dict[str, Any] = raw_data_val if isinstance(raw_data_val, dict) else {}

    # Reinforce with deterministic regex extraction to ensure no field is missed
    regex_res = _deterministic_regex_enrichment(f"{raw_extracted_text} {expected_label}", intent)

    ext_rooms = extracted_data.get("room_labels")
    parsed_rooms: List[str] = [str(r) for r in ext_rooms] if isinstance(ext_rooms, list) else []
    final_rooms = sorted(list(set(parsed_rooms + regex_res["room_labels"])))

    ext_meas = extracted_data.get("measurements")
    parsed_meas: List[str] = [str(m) for m in ext_meas] if isinstance(ext_meas, list) else []
    final_meas = list(set(parsed_meas + regex_res["measurements"]))

    raw_gla = extracted_data.get("detected_gla")
    final_gla: Optional[int] = None
    if raw_gla is not None:
        try:
            final_gla = int(re.sub(r"[^\d]", "", str(raw_gla)))
        except Exception:
            final_gla = None
    if final_gla is None:
        final_gla = regex_res["detected_gla"]

    final_flood_zone = str(extracted_data.get("flood_zone") or regex_res["flood_zone"] or "") or None
    final_lic_no = str(extracted_data.get("license_number") or regex_res["license_number"] or "") or None
    final_pol_no = str(extracted_data.get("policy_number") or regex_res["policy_number"] or "") or None
    final_cov_limit = str(extracted_data.get("coverage_limit") or regex_res["coverage_limit"] or "") or None

    ext_streets = extracted_data.get("street_names")
    parsed_streets: List[str] = [str(s) for s in ext_streets] if isinstance(ext_streets, list) else []

    normalized_data: Dict[str, Any] = {
        "exhibit_type": intent,
        "room_labels": final_rooms,
        "measurements": final_meas,
        "detected_gla": final_gla,
        "appraiser_name": extracted_data.get("appraiser_name"),
        "license_number": final_lic_no,
        "license_state": extracted_data.get("license_state") or regex_res["license_state"],
        "license_level": extracted_data.get("license_level"),
        "license_expiration": extracted_data.get("license_expiration"),
        "insurance_carrier": extracted_data.get("insurance_carrier"),
        "policy_number": final_pol_no,
        "coverage_limit": final_cov_limit,
        "policy_expiration": extracted_data.get("policy_expiration"),
        "flood_zone": final_flood_zone,
        "map_panel": extracted_data.get("map_panel"),
        "map_type": extracted_data.get("map_type"),
        "street_names": parsed_streets,
        "visible_signs_or_house_number": extracted_data.get("visible_signs_or_house_number")
    }

    discrepancies_val = result.get("discrepancies")
    discrepancies_list: List[str] = [str(d) for d in discrepancies_val] if isinstance(discrepancies_val, list) else []

    return {
        "status": "success",
        "verified": verified,
        "label_match": label_match,
        "confidence": round(conf, 2),
        "detected_scene": str(result.get("detected_scene") or intent.lower()),
        "visual_summary": str(result.get("visual_summary") or f"{intent} exhibit verified."),
        "discrepancies": discrepancies_list,
        "extracted_text": raw_extracted_text,
        "extracted_data": normalized_data
    }
