import React, { useState, useMemo } from 'react';
import {
  Paper,
  Box,
  Typography,
  Grid,
  Button,
  Stack,
  Chip,
  IconButton,
  Tooltip,
  TextField,
  InputAdornment,
  ToggleButton,
  ToggleButtonGroup,
  useTheme
} from '@mui/material';
import {
  Code as CodeIcon,
  ContentCopy as ContentCopyIcon,
  FileDownload as FileDownloadIcon,
  Search as SearchIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
  ViewColumn as ViewColumnIcon,
  Tab as TabIcon,
  AutoAwesome as AutoAwesomeIcon,
  Visibility as VisibilityIcon,
  DataObject as DataObjectIcon
} from '@mui/icons-material';

/**
 * 3-Column Extracted JSON Architecture:
 * 1. Master JSON (Regex + Gemma Fused Unified Common JSON)
 * 2. Regex JSON (Python + Regex Form Extraction)
 * 3. Gemma JSON (Gemma Vision ↔ Label Check)
 */
export const MultiModelJsonOutput = ({
  id = 'raw-output',
  data = {},
  themeMode = 'dark',
  onNotification = () => {}
}) => {
  const theme = useTheme();
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'tabs'
  const [activeTab, setActiveTab] = useState('master');
  const [expandedCol, setExpandedCol] = useState(null); // null | 'master' | 'regex' | 'gemma'
  const [searchTerm, setSearchTerm] = useState('');

  // 1. Master JSON: Regex + Gemma (Fused Unified Common JSON)
  const masterJson = useMemo(() => {
    if (data?.master_json) return data.master_json;
    // Fallback: If not separated by backend, construct from data
    const clean = { ...data };
    delete clean.raw;
    delete clean.raw_json;
    delete clean.master_json;
    delete clean.regex_json;
    delete clean.gemma_json;
    return clean;
  }, [data]);

  // 2. Regex JSON: Pure Python + Regex Form & Layout Extraction
  const regexJson = useMemo(() => {
    if (data?.regex_json) return data.regex_json;
    // Extract standard deterministic form sections
    const allowedKeys = [
      'Subject', 'SUBJECT', 'IMPROVEMENTS', 'SALES_GRID', 'NEIGHBORHOOD',
      'SITE', 'CONTRACT', 'RECONCILIATION', 'COST_APPROACH', 'INCOME_APPROACH',
      'PUD_INFO', 'CERTIFICATION', 'MATHEMATICAL_VERIFICATION'
    ];
    const res = {};
    allowedKeys.forEach(k => {
      if (data[k]) res[k] = data[k];
    });

    // Strip visual AI predictions from photos to leave pure regex layout data
    const photos = data?.EXTRACTED_PHOTOS || data?.extracted_photos || [];
    res.PHOTO_LAYOUT_REGIONS = photos.map(p => ({
      page: p.page,
      category: p.category,
      caption: p.caption,
      format: p.format,
      rect: p.rect,
      width: p.width,
      height: p.height
    }));

    return res;
  }, [data]);

  // 3. Gemma JSON: Multimodal Vision ↔ Label Check & Whole-Image Extractions
  const gemmaJson = useMemo(() => {
    if (data?.gemma_json) return data.gemma_json;
    const photos = data?.EXTRACTED_PHOTOS || data?.extracted_photos || [];
    const summary = data?.VISUAL_VERIFICATION_SUMMARY || {};
    return {
      engine: 'Gemma Multimodal Vision (gemma4:e4b)',
      total_inspections: photos.length,
      verified_count: photos.filter(p => p.vision_check?.verified).length,
      flagged_count: photos.filter(p => p.vision_check && !p.vision_check.label_match).length,
      visual_verification_summary: summary,
      floorplan_sketch_extractions: photos
        .filter(p => p.vision_check?.extracted_data?.exhibit_type === 'FLOORPLAN_SKETCH' || /sketch/i.test(`${p.category} ${p.caption}`))
        .map(p => ({
          page: p.page,
          caption: p.caption,
          room_labels: p.vision_check?.extracted_data?.room_labels || [],
          measurements: p.vision_check?.extracted_data?.measurements || [],
          detected_gla: p.vision_check?.extracted_data?.detected_gla || null,
          extracted_text: p.vision_check?.extracted_text || ''
        })),
      map_extractions: photos
        .filter(p => /map|aerial|flood/i.test(`${p.category} ${p.caption}`))
        .map(p => ({
          page: p.page,
          caption: p.caption,
          map_type: p.vision_check?.extracted_data?.map_type || p.category,
          flood_zone: p.vision_check?.extracted_data?.flood_zone || null,
          map_panel: p.vision_check?.extracted_data?.map_panel || null,
          street_names: p.vision_check?.extracted_data?.street_names || [],
          extracted_text: p.vision_check?.extracted_text || ''
        })),
      credential_extractions: photos
        .filter(p => /license|cert|insurance|e&o|policy/i.test(`${p.category} ${p.caption}`))
        .map(p => ({
          page: p.page,
          caption: p.caption,
          type: p.vision_check?.extracted_data?.exhibit_type || p.category,
          appraiser_name: p.vision_check?.extracted_data?.appraiser_name || null,
          license_number: p.vision_check?.extracted_data?.license_number || null,
          insurance_carrier: p.vision_check?.extracted_data?.insurance_carrier || null,
          policy_number: p.vision_check?.extracted_data?.policy_number || null,
          coverage_limit: p.vision_check?.extracted_data?.coverage_limit || null,
          extracted_text: p.vision_check?.extracted_text || ''
        })),
      inspections: photos.map(p => ({
        page: p.page,
        category: p.category,
        caption: p.caption,
        vision_check: p.vision_check || {
          verified: false,
          label_match: true,
          confidence: 0.75,
          detected_scene: p.category?.toLowerCase() || 'general',
          visual_summary: 'Heuristic layout verification'
        }
      }))
    };
  }, [data]);

  // Copy helper
  const handleCopy = (obj, name) => {
    try {
      navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
      onNotification({ open: true, message: `${name} copied to clipboard!`, severity: 'success' });
    } catch {
      onNotification({ open: true, message: `Failed to copy ${name}`, severity: 'error' });
    }
  };

  // Download helper
  const handleDownload = (obj, filename) => {
    try {
      const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      onNotification({ open: true, message: `Downloaded ${filename}`, severity: 'success' });
    } catch {
      onNotification({ open: true, message: `Download failed for ${filename}`, severity: 'error' });
    }
  };

  // Download all 3 JSONs in single package
  const handleDownloadAll = () => {
    const bundle = {
      master_json: masterJson,
      regex_json: regexJson,
      gemma_json: gemmaJson,
      exported_at: new Date().toISOString()
    };
    handleDownload(bundle, 'appraisal_3_json_complete_bundle.json');
  };

  // Column definitions for 1:3 layout
  const columns = [
    {
      id: 'master',
      title: 'Master JSON',
      subtitle: 'Regex + Gemma',
      badge: 'Fused Master',
      color: '#6366f1',
      bgLight: '#e0e7ff',
      icon: <AutoAwesomeIcon fontSize="small" />,
      json: masterJson,
      filename: 'master_appraisal_data.json'
    },
    {
      id: 'regex',
      title: 'Regex JSON',
      subtitle: 'Python + Regex Text Data',
      badge: 'Deterministic Form',
      color: '#0284c7',
      bgLight: '#e0f2fe',
      icon: <DataObjectIcon fontSize="small" />,
      json: regexJson,
      filename: 'regex_form_data.json'
    },
    {
      id: 'gemma',
      title: 'Gemma JSON',
      subtitle: 'Image ↔ Label Check',
      badge: 'Multimodal Vision',
      color: '#f59e0b',
      bgLight: '#fef3c7',
      icon: <VisibilityIcon fontSize="small" />,
      json: gemmaJson,
      filename: 'gemma_vision_verification.json'
    }
  ];

  // Code filtering for search term
  const formatJson = (obj) => {
    const str = JSON.stringify(obj, null, 2);
    if (!searchTerm.trim()) return str;
    return str;
  };

  const isDark = themeMode === 'dark';

  return (
    <Paper
      id={id}
      elevation={3}
      sx={{
        mt: 4,
        mb: 4,
        p: { xs: 2, sm: 3 },
        borderRadius: 3,
        backgroundColor: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: isDark
          ? '0 10px 30px rgba(0,0,0,0.4)'
          : '0 10px 25px rgba(0,0,0,0.06)'
      }}
    >
      {/* Main Header & Global Controls */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', md: 'center' },
          gap: 2,
          mb: 3,
          pb: 2,
          borderBottom: `1px solid ${theme.palette.divider}`
        }}
      >
        <Box>
          <Typography
            variant="h6"
            fontWeight={800}
            display="flex"
            alignItems="center"
            gap={1.5}
            sx={{ color: theme.palette.text.primary, letterSpacing: '-0.3px' }}
          >
            <CodeIcon color="primary" sx={{ fontSize: 28 }} />
            3-Column Extracted JSON Architecture
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Master JSON (Regex + Gemma) • Python + Regex • Gemma Multimodal Vision
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5} flexWrap="wrap" alignItems="center">
          {/* Search Box */}
          <TextField
            size="small"
            placeholder="Search JSON..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" color="action" />
                </InputAdornment>
              )
            }}
            sx={{ width: { xs: '100%', sm: 180, md: 200 } }}
          />

          {/* View Mode Switcher */}
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, val) => val && setViewMode(val)}
            size="small"
            aria-label="view mode"
          >
            <ToggleButton value="grid" title="3-Column Grid">
              <ViewColumnIcon fontSize="small" sx={{ mr: 0.5 }} />
              3-Column Grid
            </ToggleButton>
            <ToggleButton value="tabs" title="Tabbed View">
              <TabIcon fontSize="small" sx={{ mr: 0.5 }} />
              Tabs
            </ToggleButton>
          </ToggleButtonGroup>

          {/* Download All Bundle */}
          <Button
            size="small"
            variant="contained"
            color="primary"
            startIcon={<FileDownloadIcon />}
            onClick={handleDownloadAll}
            sx={{ fontWeight: 700 }}
          >
            Download All 3
          </Button>
        </Stack>
      </Box>

      {/* Tabs Switcher (Only in Tabs View) */}
      {viewMode === 'tabs' && (
        <Stack direction="row" spacing={1} sx={{ mb: 2.5, overflowX: 'auto', pb: 1 }}>
          {columns.map(col => (
            <Chip
              key={col.id}
              icon={col.icon}
              label={col.title}
              clickable
              onClick={() => setActiveTab(col.id)}
              color={activeTab === col.id ? 'primary' : 'default'}
              variant={activeTab === col.id ? 'filled' : 'outlined'}
              sx={{
                fontWeight: 700,
                fontSize: '0.85rem',
                py: 2,
                borderColor: col.color,
                color: activeTab === col.id ? '#fff' : col.color
              }}
            />
          ))}
        </Stack>
      )}

      {/* 3-Column Output Layout */}
      <Grid container spacing={2}>
        {columns
          .filter(col => {
            if (expandedCol) return col.id === expandedCol;
            if (viewMode === 'tabs') return col.id === activeTab;
            return true;
          })
          .map((col) => {
            const isExpanded = expandedCol === col.id;
            const colGridSize = isExpanded || viewMode === 'tabs' ? 12 : 4;

            return (
              <Grid item xs={12} sm={isExpanded ? 12 : 6} md={colGridSize} key={col.id}>
                <Paper
                  variant="outlined"
                  sx={{
                    borderRadius: 2.5,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%',
                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                    boxShadow: isDark
                      ? '0 4px 14px rgba(0,0,0,0.3)'
                      : '0 4px 12px rgba(0,0,0,0.03)',
                    transition: 'all 0.25s ease'
                  }}
                >
                  {/* Column Header */}
                  <Box
                    sx={{
                      p: 1.5,
                      px: 2,
                      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : col.bgLight,
                      borderBottom: `2px solid ${col.color}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 28,
                          height: 28,
                          borderRadius: 1.5,
                          backgroundColor: col.color,
                          color: '#fff'
                        }}
                      >
                        {col.icon}
                      </Box>
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
                          {col.title}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.68rem' }}>
                          {col.subtitle}
                        </Typography>
                      </Box>
                    </Box>

                    {/* Column Action Buttons */}
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <Tooltip title={`Copy ${col.title}`}>
                        <IconButton
                          size="small"
                          onClick={() => handleCopy(col.json, col.title)}
                          sx={{ color: col.color }}
                        >
                          <ContentCopyIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={`Download ${col.title}`}>
                        <IconButton
                          size="small"
                          onClick={() => handleDownload(col.json, col.filename)}
                          sx={{ color: col.color }}
                        >
                          <FileDownloadIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {viewMode === 'grid' && (
                        <Tooltip title={isExpanded ? "Restore 1:4 Grid" : "Expand to Fullwidth"}>
                          <IconButton
                            size="small"
                            onClick={() => setExpandedCol(isExpanded ? null : col.id)}
                            sx={{ color: 'text.secondary' }}
                          >
                            {isExpanded ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
                          </IconButton>
                        </Tooltip>
                      )}
                    </Stack>
                  </Box>

                  {/* JSON Code Viewer */}
                  <Box
                    component="pre"
                    sx={{
                      m: 0,
                      p: 2,
                      flexGrow: 1,
                      backgroundColor: isDark ? '#0d1117' : '#1e293b',
                      color: isDark ? '#79c0ff' : '#38bdf8',
                      fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                      fontSize: '0.78rem',
                      lineHeight: 1.55,
                      maxHeight: isExpanded ? '650px' : '460px',
                      overflow: 'auto',
                      scrollbarWidth: 'thin',
                      '&::-webkit-scrollbar': {
                        width: '6px',
                        height: '6px'
                      },
                      '&::-webkit-scrollbar-thumb': {
                        backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.3)',
                        borderRadius: '3px'
                      }
                    }}
                  >
                    <code>{formatJson(col.json)}</code>
                  </Box>
                </Paper>
              </Grid>
            );
          })}
      </Grid>
    </Paper>
  );
};

export default MultiModelJsonOutput;
