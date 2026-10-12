import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useCallback, useState } from 'react';
import {
  Button,
  CircularProgress,
  Paper,
  Typography,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Stack,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip
} from '@mui/material';

export const STATE_REQUIREMENTS_PROMPT = `
Analyze the appraisal report for state-specific requirements based on the property's state.
Your output must be a single, clean JSON object. Do not include any text outside of the JSON object.
The JSON object must have a "summary" (a one to two-line overview of findings) and a "details" array.
Each object in the "details" array represents a requirement and must have the following keys:
- "requirement": A string describing the state-specific rule being checked.
- "status": A string, which must be one of 'Fulfilled', 'Not Fulfilled', or 'Not Applicable'.
- "value_or_comment": A string containing the extracted value or a brief comment explaining the status. If a value is extracted, also include the page number.

State-Specific Requirements:
1. Appraiser’s Fee Disclosure:
   - The appraiser’s fee must be disclosed within the body of the report for: AZ, Colorado (CO), CT, GA, IL, LA, NJ, NV, NM, ND, OH, UT, VA, VT, and WV.
   - For all NY appraisals: Appraisers must attach a copy of the invoice to the report (unless Plaza Home Mortgage). If invoice is missing, reject as: 'Please attach a copy of the invoice to the report.'
2. AMC License # Inclusion:
   - The AMC License # must be included for reports in: Georgia (GA), Illinois (IL), Montana (MT), New Jersey (NJ), Ohio (OH), and Vermont (VT).
3. AMC # and Expiration Date:
   - Required for Illinois (IL): AMC Reg # 558.000312 Expires 12/31/2026. Reject as: 'Please include our AMC License # 558000312 and Expiration date 12/31/2026 in the report.'
4. AMC Fee Inclusion:
   - AMC fee to be included in all reports located in: Nevada (NV), New Mexico (NM), and Utah (UT).
5. State-Specific Guidelines:
   - California (CA): Appraiser must comment if smoke/CO detectors were or were not present and indicate if the hot water heater is properly double strapped (earthquake straps).
   - Georgia (GA): After year built 2008 requires carbon monoxide detectors be installed in general sleeping areas in all new one- and two-family homes and townhomes of three stories or less.
   - Illinois (IL):
     1) AMC License # 558000312 and Expiration date 12/31/2026 in report.
     2) Appraiser must disclose fee within the certification of the report. Per Illinois Administrative Code 1455.245 Scope of Property Condition Inspections by Real Estate Appraisers, required statement on all 1-4 residential units: "The comments by the licensed real estate appraiser contained within this appraisal report on the condition of the property do not address 'standards of practice' as defined in the Home Inspector License Act [225 ILCS 441] and 68 Ill. Adm. Code 1410 and are not to be considered a home inspection or home inspection report."
     3) Comment if Carbon Monoxide detector is present and provide photos.
   - Utah (UT):
     1) Utah requires double strapped water heaters (For Loan Store - address if water heaters are double strapped).
     2) AMC fee to be included in all reports located in Utah.
     3) Appraiser’s fee must be disclosed within body of report.
   - Virginia (VA): Confirm if smoke and CO detectors are installed.
   - Wisconsin (WI):
     1) Attach a copy of invoice to the report.
     2) Wis. Stat. Ann. § 101.647 1-2 Family Dwelling Code requires CO detector on each floor and in basement if attached garage, fireplace, or fuel-burning appliance. Reject as: 'Appraiser to confirm CO detector(s) are installed.'
   - New York (NY): Invoice copy should be included in the report (except Plaza Home Mortgage).
`;

const StateRequirementCheck = ({ onPromptSubmit, loading, response, error }) => {
  const [filterValue, setFilterValue] = useState('all');

  const handleCheckRequirements = () => {
    onPromptSubmit(STATE_REQUIREMENTS_PROMPT);
  };

  const renderResponse = useCallback(() => {
    if (!response) return null;

    let data = response;
    if (typeof response === 'string') {
      try {
        data = JSON.parse(response);
      } catch (e) {
        return <pre>{response}</pre>;
      }
    }

    const { summary, details } = data;

    const greenStatuses = ['fulfilled', 'ok', 'pass', 'passed', 'yes'];
    const isGreen = (status) => {
      const normalized = String(status || '').trim().toLowerCase();
      return greenStatuses.includes(normalized);
    };

    const parsedDetails = Array.isArray(details) ? details : [];

    const filteredDetails = parsedDetails.filter(item => {
      if (filterValue === 'passed') return isGreen(item.status);
      if (filterValue === 'failed') return !isGreen(item.status);
      return true;
    });

    const sortedDetails = [...filteredDetails].sort((a, b) => {
      const isGreenA = isGreen(a.status);
      const isGreenB = isGreen(b.status);
      if (isGreenA && !isGreenB) return -1;
      if (!isGreenA && isGreenB) return 1;
      return 0;
    });

    const getStatusBadge = (status) => {
      const norm = String(status || '').trim().toLowerCase();
      if (greenStatuses.includes(norm)) {
        return {
          style: { backgroundColor: '#28a745', color: '#ffffff', padding: '4px 10px', borderRadius: '4px', fontWeight: 600, display: 'inline-block' },
          hasTooltip: false
        };
      }
      if (['not fulfilled', 'failed', 'fail', 'no', 'rejected'].includes(norm)) {
        return {
          style: { backgroundColor: '#dc3545', color: '#ffffff', padding: '4px 10px', borderRadius: '4px', fontWeight: 600, display: 'inline-block', cursor: 'pointer' },
          hasTooltip: true
        };
      }
      if (['needs review', 'review', 'warning'].includes(norm)) {
        return {
          style: { backgroundColor: '#ffc107', color: '#212529', padding: '4px 10px', borderRadius: '4px', fontWeight: 600, display: 'inline-block', cursor: 'pointer' },
          hasTooltip: true
        };
      }
      return {
        style: { backgroundColor: '#6c757d', color: '#ffffff', padding: '4px 10px', borderRadius: '4px', fontWeight: 500, display: 'inline-block' },
        hasTooltip: false
      };
    };

    return (
      <Stack spacing={3} sx={{ mt: 3 }}>
        {summary && (
          <Paper elevation={1} sx={{ p: 2, bgcolor: 'background.default' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="h6" component="div" color="primary.main">
                Summary
              </Typography>
              {data?.engine && (
                <Chip
                  size="small"
                  icon={<AutoAwesomeIcon sx={{ fontSize: 14 }} />}
                  label={data.engine}
                  color="primary"
                  variant="outlined"
                  sx={{ fontWeight: 600, fontSize: '0.75rem' }}
                />
              )}
            </Stack>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {summary}
            </Typography>
          </Paper>
        )}

        {details && Array.isArray(details) && (
          <Paper elevation={1} sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="h6" component="div" color="primary.main">
                Details
              </Typography>
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel id="state-status-filter-label">Filter Status</InputLabel>
                <Select
                  labelId="state-status-filter-label"
                  id="state-status-filter"
                  value={filterValue}
                  label="Filter Status"
                  onChange={(e) => setFilterValue(e.target.value)}
                >
                  <MenuItem value="all">All</MenuItem>
                  <MenuItem value="passed">Passed / OK</MenuItem>
                  <MenuItem value="failed">Failed / Review</MenuItem>
                </Select>
              </FormControl>
            </Stack>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 'bold' }}>Requirement</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Value / Comment</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sortedDetails.length > 0 ? (
                    sortedDetails.map((item, index) => {
                      const badge = getStatusBadge(item.status);

                      let tooltipContent = '';
                      if (badge.hasTooltip) {
                        if (typeof item.value_or_comment === 'object' && item.value_or_comment !== null) {
                          tooltipContent = item.value_or_comment.value || JSON.stringify(item.value_or_comment);
                        } else {
                          tooltipContent = item.value_or_comment;
                        }
                      }
                      return (
                        <TableRow key={index}>
                          <TableCell sx={{ fontWeight: 500 }}>{item.requirement}</TableCell>
                          <TableCell>
                            {badge.hasTooltip && tooltipContent ? (
                              <Tooltip title={tooltipContent} arrow>
                                <span style={badge.style}>{item.status}</span>
                              </Tooltip>
                            ) : (
                              <span style={badge.style}>{item.status}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {typeof item.value_or_comment === 'object' && item.value_or_comment !== null ? (
                              <>
                                {item.value_or_comment.value && (
                                  <Typography variant="body2">{item.value_or_comment.value}</Typography>
                                )}
                                {item.value_or_comment.page_no && (
                                  <Typography variant="caption" color="text.secondary">
                                    Page: {item.value_or_comment.page_no}
                                  </Typography>
                                )}
                              </>
                            ) : (
                              item.value_or_comment
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} align="center">
                        No matching items found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}
      </Stack>
    );
  }, [response, filterValue]);

  return (
    <div id="state-requirement-section" className="card shadow mb-4">
      <div className="card-header CAR1 bg-primary text-white">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <strong>State Requirement Check</strong>
          <Chip
            size="small"
            icon={<AutoAwesomeIcon style={{ fontSize: 14, color: '#fff' }} />}
            label="Gemma QA Engine"
            style={{ backgroundColor: 'rgba(255,255,255,0.25)', color: '#fff', fontWeight: 600, fontSize: '0.75rem' }}
          />
        </div>
      </div>
      <div className="card-body">
        <Stack spacing={2}>
          <Button
            onClick={handleCheckRequirements}
            variant="contained"
            color="secondary"
            disabled={loading}
          >
            {loading ? <CircularProgress size={24} /> : 'Check State Requirements (Gemma)'}
          </Button>

          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
          {response && renderResponse()}
        </Stack>
      </div>
    </div>
  );
};

export default StateRequirementCheck;
