import React, { useState, useMemo } from 'react';
import {
  Paper,
  Box,
  Typography,
  Chip,
  Grid,
  Card,
  CardMedia,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Tooltip,
  Alert,
  Stack,
  LinearProgress,
  Button
} from '@mui/material';
import {
  PhotoLibrary as PhotoLibraryIcon,
  ZoomIn as ZoomInIcon,
  Close as CloseIcon,
  CheckCircle as CheckCircleIcon,
  WarningAmber as WarningIcon,
  Collections as CollectionsIcon,
  ImageSearch as ImageSearchIcon,
  RotateRight as RotateRightIcon,
  ContentCopy as ContentCopyIcon,
  Label as LabelIcon
} from '@mui/icons-material';

export const PhotosGallerySection = ({
  id = 'photos-exhibits-section',
  data = {},
  allData = {},
  extractedPhotos = []
}) => {
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedLabel, setSelectedLabel] = useState(null);
  const [labelScope, setLabelScope] = useState('category'); // 'category' | 'all'
  const [copiedNotification, setCopiedNotification] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [rotation, setRotation] = useState(0);

  // Combine photos from props or from data/allData
  const photosList = useMemo(() => {
    if (Array.isArray(extractedPhotos) && extractedPhotos.length > 0) {
      return extractedPhotos;
    }
    if (data?.EXTRACTED_PHOTOS && Array.isArray(data.EXTRACTED_PHOTOS)) {
      return data.EXTRACTED_PHOTOS;
    }
    if (data?.extracted_photos && Array.isArray(data.extracted_photos)) {
      return data.extracted_photos;
    }
    if (allData?.EXTRACTED_PHOTOS && Array.isArray(allData.EXTRACTED_PHOTOS)) {
      return allData.EXTRACTED_PHOTOS;
    }
    if (allData?.extracted_photos && Array.isArray(allData.extracted_photos)) {
      return allData.extracted_photos;
    }
    return [];
  }, [extractedPhotos, data, allData]);

  // Categories and counts
  const categoryCounts = useMemo(() => {
    const counts = {
      ALL: photosList.length,
      Subject: 0,
      Comparable: 0,
      Rental: 0,
      Interior: 0,
      Sketch: 0,
      Map: 0,
      License: 0,
      Insurance: 0,
      General: 0
    };
    photosList.forEach(p => {
      const cat = p.category || 'General';
      if (counts[cat] !== undefined) {
        counts[cat]++;
      } else {
        counts.General++;
      }
    });
    return counts;
  }, [photosList]);

  // Photos used to calculate label counts: either current category or all exhibits
  const scopePhotos = useMemo(() => {
    if (labelScope === 'all' || selectedCategory === 'ALL') {
      return photosList;
    }
    return photosList.filter(p => (p.category || 'General') === selectedCategory);
  }, [photosList, selectedCategory, labelScope]);

  // Aggregate distinct labels and their total count
  const labelCounts = useMemo(() => {
    const map = new Map();
    scopePhotos.forEach(p => {
      const label = (p.caption && p.caption.trim()) || p.category || 'Exhibit Photo';
      map.set(label, (map.get(label) || 0) + 1);
    });
    // Sort by count descending, then alphabetically
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [scopePhotos]);

  // Total label count string formatted exactly as requested:
  // e.g. (Kitchen: 7, Living Room: 2, Dining Room: 2, Bedroom 1: 1)
  const formattedLabelCountsString = useMemo(() => {
    if (labelCounts.length === 0) return '()';
    return `(${labelCounts.map(([label, count]) => `${label}: ${count}`).join(', ')})`;
  }, [labelCounts]);

  const handleCopyFormattedString = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(formattedLabelCountsString);
      setCopiedNotification(true);
      setTimeout(() => setCopiedNotification(false), 2000);
    }
  };

  const [searchTerm, setSearchTerm] = useState('');

  // Filtered photos by Category, Selected Label AND Search Term
  const filteredPhotos = useMemo(() => {
    return photosList.filter(p => {
      const matchCat = selectedCategory === 'ALL' || (p.category || 'General') === selectedCategory;
      const photoLabel = (p.caption && p.caption.trim()) || p.category || 'Exhibit Photo';
      const matchLabel = !selectedLabel || photoLabel.toLowerCase() === selectedLabel.toLowerCase();
      const matchSearch = !searchTerm.trim() ||
        (p.caption && p.caption.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.category && p.category.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (`page ${p.page}`.includes(searchTerm.toLowerCase()));
      return matchCat && matchLabel && matchSearch;
    });
  }, [photosList, selectedCategory, selectedLabel, searchTerm]);

  // Requirement Verification Checks
  const verificationStatus = useMemo(() => {
    const hasFront = photosList.some(p => /front/i.test(p.caption || '') || /front/i.test(p.category || ''));
    const hasRear = photosList.some(p => /rear/i.test(p.caption || '') || /rear/i.test(p.category || ''));
    const hasStreet = photosList.some(p => /street/i.test(p.caption || '') || /street/i.test(p.category || ''));
    const compPhotosCount = photosList.filter(p => /comparable/i.test(p.category || '') || /comp/i.test(p.caption || '')).length;
    const hasSketch = photosList.some(p => p.category === 'Sketch' || /sketch|floor\s*plan/i.test(p.caption || ''));
    const hasMap = photosList.some(p => p.category === 'Map' || /map|aerial/i.test(p.caption || ''));
    const hasLicense = photosList.some(p => p.category === 'License' || /license|certification|dbpr/i.test(p.caption || ''));
    const hasInsurance = photosList.some(p => p.category === 'Insurance' || /insurance|e&o|policy|liability/i.test(p.caption || ''));

    return [
      { label: 'Subject Front View', pass: hasFront },
      { label: 'Subject Rear View', pass: hasRear },
      { label: 'Subject Street Scene', pass: hasStreet },
      { label: `Comparable Photos (${compPhotosCount} Found)`, pass: compPhotosCount >= 3 },
      { label: 'Building Sketch / Floor Plan', pass: hasSketch },
      { label: 'Location Map / Aerial', pass: hasMap },
      { label: 'Appraiser License', pass: hasLicense },
      { label: 'E&O Insurance Policy', pass: hasInsurance }
    ];
  }, [photosList]);

  const getCategoryColor = (cat) => {
    switch (cat) {
      case 'Subject': return { bg: '#e3f2fd', color: '#1565c0', border: '#90caf9' };
      case 'Comparable': return { bg: '#f3e5f5', color: '#7b1fa2', border: '#ce93d8' };
      case 'Rental': return { bg: '#e8f5e9', color: '#2e7d32', border: '#a5d6a7' };
      case 'Interior': return { bg: '#fff3e0', color: '#e65100', border: '#ffcc80' };
      case 'Sketch': return { bg: '#fbe9e7', color: '#d84315', border: '#ffab91' };
      case 'Map': return { bg: '#e0f2f1', color: '#00695c', border: '#80cbc4' };
      case 'License': return { bg: '#fff8e1', color: '#f57f17', border: '#ffe082' };
      case 'Insurance': return { bg: '#e0f7fa', color: '#00838f', border: '#80deea' };
      default: return { bg: '#f5f5f5', color: '#424242', border: '#e0e0e0' };
    }
  };

  return (
    <Paper
      id={id}
      elevation={2}
      sx={{
        p: 2.5,
        my: 2.5,
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: 'divider',
        backgroundColor: 'background.paper',
        transition: 'all 0.3s ease'
      }}
    >
      {/* Section Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 40,
              height: 40,
              borderRadius: 2,
              backgroundColor: 'primary.main',
              color: 'primary.contrastText',
              boxShadow: '0 4px 10px rgba(0,0,0,0.15)'
            }}
          >
            <PhotoLibraryIcon />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              Extracted Photos, Exhibits & Visual Addenda
            </Typography>
            <Typography variant="caption" color="text.secondary">
              100% Deterministic Photo Extraction paired with report page coordinates and labeled captions
            </Typography>
          </Box>
        </Box>

        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Chip
            icon={<LabelIcon fontSize="small" />}
            label={`${labelCounts.length} Distinct Labels`}
            color="secondary"
            variant="outlined"
            sx={{ fontWeight: 600 }}
          />
          <Chip
            icon={<CollectionsIcon fontSize="small" />}
            label={`${photosList.length} Photos / Exhibits`}
            color="primary"
            variant="outlined"
            sx={{ fontWeight: 600 }}
          />
        </Stack>
      </Box>

      {/* Verification Checklist Bar */}
      <Paper
        variant="outlined"
        sx={{
          p: 1.5,
          mb: 2.5,
          borderRadius: 2,
          backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
          border: '1px dashed',
          borderColor: 'divider'
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <CheckCircleIcon color="success" fontSize="small" />
          Photo Addenda Compliance Checklist
        </Typography>
        <Grid container spacing={1}>
          {verificationStatus.map((item, idx) => (
            <Grid item xs={12} sm={6} md={4} key={idx}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  p: 0.75,
                  borderRadius: 1.5,
                  backgroundColor: item.pass ? 'rgba(46, 125, 50, 0.08)' : 'rgba(237, 108, 2, 0.08)',
                  border: `1px solid ${item.pass ? 'rgba(46, 125, 50, 0.25)' : 'rgba(237, 108, 2, 0.25)'}`
                }}
              >
                {item.pass ? (
                  <CheckCircleIcon sx={{ color: 'success.main', fontSize: 18 }} />
                ) : (
                  <WarningIcon sx={{ color: 'warning.main', fontSize: 18 }} />
                )}
                <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem', color: item.pass ? 'success.dark' : 'warning.dark' }}>
                  {item.label}
                </Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Paper>

      {/* Filter and Search Bar */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5, flexWrap: 'wrap', gap: 1.5 }}>
        <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', pb: 0.5 }}>
          {[
            { key: 'ALL', label: 'All Exhibits' },
            { key: 'Subject', label: 'Subject Photos' },
            { key: 'Comparable', label: 'Comparable Photos' },
            { key: 'Rental', label: 'Rental Photos' },
            { key: 'Interior', label: 'Interior Rooms' },
            { key: 'Sketch', label: 'Building Sketch' },
            { key: 'Map', label: 'Maps & Aerials' },
            { key: 'License', label: 'Appraiser License' },
            { key: 'Insurance', label: 'E&O Insurance' },
            { key: 'General', label: 'Other Exhibits' }
          ].map(({ key, label }) => {
            const count = categoryCounts[key] || 0;
            if (count === 0 && key !== 'ALL') return null;
            const isSelected = selectedCategory === key;
            return (
              <Chip
                key={key}
                label={`${label} (${count})`}
                onClick={() => {
                  setSelectedCategory(key);
                  setSelectedLabel(null);
                }}
                color={isSelected ? 'primary' : 'default'}
                variant={isSelected ? 'filled' : 'outlined'}
                sx={{
                  fontWeight: isSelected ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  '&:hover': { transform: 'translateY(-1px)' }
                }}
              />
            );
          })}
        </Stack>

        <input
          type="text"
          placeholder="Search by label or room..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid #ccc',
            fontSize: '0.85rem',
            outline: 'none',
            minWidth: '220px'
          }}
        />
      </Box>

      {/* Main Content Area: Left = Photos Grid, Right = Red Highlighted Area (Separate Container for Label Counts) */}
      <Grid container spacing={2.5} alignItems="flex-start">
        {/* Left Column: Photos Gallery */}
        <Grid item xs={12} lg={8.5} xl={9}>
          {filteredPhotos.length === 0 ? (
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              No extracted photos found matching your filter or search.
              {selectedLabel && (
                <Button size="small" onClick={() => setSelectedLabel(null)} sx={{ ml: 1, textTransform: 'none' }}>
                  Clear label filter "{selectedLabel}"
                </Button>
              )}
            </Alert>
          ) : (
            <Grid container spacing={2}>
              {filteredPhotos.map((photo, index) => {
                const catStyle = getCategoryColor(photo.category);
                const imgSrc = photo.base64_preview || '';

                return (
                  <Grid item xs={12} sm={6} md={4} lg={4} xl={3} key={index}>
                <Card
                  variant="outlined"
                  sx={{
                    borderRadius: 2,
                    overflow: 'hidden',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
                      '& .photo-overlay': { opacity: 1 }
                    }
                  }}
                  onClick={() => {
                    setRotation(0);
                    setPreviewPhoto(photo);
                  }}
                >
                  <Box sx={{ position: 'relative', width: '100%', height: 180, backgroundColor: '#0f172a' }}>
                    {imgSrc ? (
                      <CardMedia
                        component="img"
                        image={imgSrc}
                        alt={photo.caption}
                        sx={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain',
                          backgroundColor: '#1e293b'
                        }}
                      />
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'grey.500' }}>
                        <ImageSearchIcon sx={{ fontSize: 40 }} />
                      </Box>
                    )}

                    {/* Category Badge Top Left */}
                    <Chip
                      size="small"
                      label={photo.category || 'Exhibit'}
                      sx={{
                        position: 'absolute',
                        top: 8,
                        left: 8,
                        fontWeight: 700,
                        fontSize: '0.7rem',
                        backgroundColor: catStyle.bg,
                        color: catStyle.color,
                        border: `1px solid ${catStyle.border}`
                      }}
                    />

                    {/* Page Number Top Right */}
                    <Chip
                      size="small"
                      label={`Page ${photo.page}`}
                      sx={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        fontWeight: 600,
                        fontSize: '0.7rem',
                        backgroundColor: 'rgba(0,0,0,0.75)',
                        color: '#fff'
                      }}
                    />

                    {/* Hover Zoom Overlay */}
                    <Box
                      className="photo-overlay"
                      sx={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.45)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: 0,
                        transition: 'opacity 0.2s',
                        color: '#fff'
                      }}
                    >
                      <ZoomInIcon sx={{ fontSize: 36 }} />
                    </Box>
                  </Box>

                  <CardContent sx={{ p: 1.5, flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 700,
                          color: 'text.primary',
                          lineHeight: 1.3,
                          mb: 0.5,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden'
                        }}
                        title={photo.caption}
                      >
                        {photo.caption || 'Exhibit Photo'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                        Page {photo.page} • {photo.width} × {photo.height} pt
                      </Typography>
                    </Box>

                    {/* Multimodal Inspection Badges (Gemma Vision) */}
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                      {photo.vision_check && (
                        <Chip
                          size="small"
                          label={photo.vision_check.verified ? "✓ Gemma Verified" : "⚠ Visual Flag"}
                          color={photo.vision_check.verified ? "success" : "warning"}
                          variant="filled"
                          sx={{ fontSize: '0.65rem', height: 20, fontWeight: 700 }}
                        />
                      )}
                      {photo.vision_check?.extracted_data?.room_labels?.length > 0 && (
                        <Chip
                          size="small"
                          label={`Rooms: ${photo.vision_check.extracted_data.room_labels.slice(0, 2).join(', ')}`}
                          color="info"
                          variant="outlined"
                          sx={{ fontSize: '0.65rem', height: 20 }}
                        />
                      )}
                      {photo.vision_check?.extracted_data?.detected_gla && (
                        <Chip
                          size="small"
                          label={`GLA: ${photo.vision_check.extracted_data.detected_gla} sf`}
                          color="secondary"
                          variant="outlined"
                          sx={{ fontSize: '0.65rem', height: 20 }}
                        />
                      )}
                      {photo.vision_check?.extracted_data?.flood_zone && (
                        <Chip
                          size="small"
                          label={`Flood: ${photo.vision_check.extracted_data.flood_zone}`}
                          color="primary"
                          variant="outlined"
                          sx={{ fontSize: '0.65rem', height: 20 }}
                        />
                      )}
                      {photo.vision_check?.extracted_data?.license_number && (
                        <Chip
                          size="small"
                          label={`Lic: #${photo.vision_check.extracted_data.license_number}`}
                          color="success"
                          variant="outlined"
                          sx={{ fontSize: '0.65rem', height: 20 }}
                        />
                      )}
                      {photo.vision_check?.extracted_data?.policy_number && (
                        <Chip
                          size="small"
                          label={`E&O: #${photo.vision_check.extracted_data.policy_number}`}
                          color="warning"
                          variant="outlined"
                          sx={{ fontSize: '0.65rem', height: 20 }}
                        />
                      )}
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}
        </Grid>

        {/* Right Column: Red Highlighted Area - Dedicated Separate Container for Diff Label Total Count */}
        <Grid item xs={12} lg={3.5} xl={3}>
          <Paper
            elevation={2}
            sx={{
              p: 2,
              borderRadius: 2.5,
              border: '1.5px solid',
              borderColor: 'primary.light',
              backgroundColor: (theme) => theme.palette.mode === 'dark' ? '#1e293b' : '#f8fafc',
              position: { lg: 'sticky' },
              top: 20,
              boxShadow: '0 4px 18px rgba(0,0,0,0.06)',
              transition: 'all 0.2s ease'
            }}
          >
            {/* Container Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, pb: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <LabelIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.9rem', color: 'text.primary' }}>
                  Photo Label Counts
                </Typography>
              </Box>
              <Chip
                size="small"
                label={`${scopePhotos.length} Total`}
                color="primary"
                sx={{ fontWeight: 700, fontSize: '0.72rem', height: 22 }}
              />
            </Box>

            {/* Scope Switcher: Current Category vs All Photos */}
            <Box sx={{ display: 'flex', gap: 0.5, mb: 1.5 }}>
              <Chip
                size="small"
                label={selectedCategory === 'ALL' ? `All (${photosList.length})` : `${selectedCategory} (${scopePhotos.length})`}
                onClick={() => setLabelScope('category')}
                color={labelScope === 'category' ? 'primary' : 'default'}
                variant={labelScope === 'category' ? 'filled' : 'outlined'}
                sx={{ fontSize: '0.7rem', height: 24, fontWeight: labelScope === 'category' ? 700 : 500, cursor: 'pointer' }}
              />
              <Chip
                size="small"
                label={`All Exhibits (${photosList.length})`}
                onClick={() => setLabelScope('all')}
                color={labelScope === 'all' ? 'primary' : 'default'}
                variant={labelScope === 'all' ? 'filled' : 'outlined'}
                sx={{ fontSize: '0.7rem', height: 24, fontWeight: labelScope === 'all' ? 700 : 500, cursor: 'pointer' }}
              />
            </Box>

            {/* Highlighted Total Count Callout: (Kitchen: 7, Living Room: 2, Dining Room: 2, Bedroom 1: 1) */}
            <Box
              sx={{
                p: 1.5,
                mb: 2,
                borderRadius: 2,
                backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.9)' : '#ffffff',
                border: '1.5px solid',
                borderColor: 'primary.main',
                boxShadow: '0 2px 8px rgba(25, 118, 210, 0.08)'
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main', textTransform: 'uppercase', letterSpacing: 0.6, fontSize: '0.68rem' }}>
                  Total Count Format
                </Typography>
                <Tooltip title={copiedNotification ? "Copied!" : "Copy count string"}>
                  <IconButton size="small" onClick={handleCopyFormattedString} sx={{ p: 0.25, color: copiedNotification ? 'success.main' : 'text.secondary' }}>
                    {copiedNotification ? <CheckCircleIcon sx={{ fontSize: 16 }} /> : <ContentCopyIcon sx={{ fontSize: 16 }} />}
                  </IconButton>
                </Tooltip>
              </Box>

              <Typography
                variant="body2"
                sx={{
                  fontFamily: 'Consolas, Menlo, Monaco, "Courier New", monospace',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  lineHeight: 1.45,
                  color: 'primary.dark',
                  wordBreak: 'break-word',
                  userSelect: 'all'
                }}
              >
                {formattedLabelCountsString}
              </Typography>
            </Box>

            {/* Active Filter Notice */}
            {selectedLabel && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  p: 1,
                  mb: 1.5,
                  borderRadius: 1.5,
                  backgroundColor: 'primary.light',
                  color: 'primary.contrastText'
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                  Active: <strong>{selectedLabel}</strong>
                </Typography>
                <Chip
                  size="small"
                  label="Clear ✕"
                  onClick={() => setSelectedLabel(null)}
                  sx={{
                    height: 20,
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    backgroundColor: '#fff',
                    color: 'primary.main',
                    cursor: 'pointer'
                  }}
                />
              </Box>
            )}

            {/* List of Different Labels with Individual Counts & Progress Bar */}
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 1, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.68rem' }}>
              Distinct Labels ({labelCounts.length}) • Click to Filter
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 420, overflowY: 'auto', pr: 0.5 }}>
              {labelCounts.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', fontSize: '0.8rem', py: 1 }}>
                  No labeled photos found.
                </Typography>
              ) : (
                labelCounts.map(([label, count]) => {
                  const isSelected = selectedLabel && selectedLabel.toLowerCase() === label.toLowerCase();
                  const percentage = scopePhotos.length > 0 ? Math.round((count / scopePhotos.length) * 100) : 0;

                  return (
                    <Box
                      key={label}
                      onClick={() => setSelectedLabel(prev => prev === label ? null : label)}
                      sx={{
                        p: 1,
                        borderRadius: 1.5,
                        border: '1px solid',
                        borderColor: isSelected ? 'primary.main' : 'divider',
                        backgroundColor: isSelected
                          ? (theme) => theme.palette.mode === 'dark' ? 'rgba(25, 118, 210, 0.25)' : '#e3f2fd'
                          : (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#ffffff',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        '&:hover': {
                          borderColor: 'primary.main',
                          transform: 'translateY(-1px)',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.06)'
                        }
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: isSelected ? 700 : 600,
                            fontSize: '0.8rem',
                            color: isSelected ? 'primary.main' : 'text.primary',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: '70%'
                          }}
                          title={label}
                        >
                          {label}
                        </Typography>
                        <Chip
                          size="small"
                          label={`${count}`}
                          color={isSelected ? 'primary' : 'default'}
                          sx={{
                            fontWeight: 700,
                            fontSize: '0.72rem',
                            height: 20,
                            minWidth: 28,
                            backgroundColor: isSelected ? 'primary.main' : undefined
                          }}
                        />
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={percentage}
                        sx={{
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
                          '& .MuiLinearProgress-bar': {
                            backgroundColor: isSelected ? 'primary.main' : 'primary.light'
                          }
                        }}
                      />
                    </Box>
                  );
                })
              )}
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Fullscreen Preview Lightbox Modal */}
      <Dialog
        open={Boolean(previewPhoto)}
        onClose={() => setPreviewPhoto(null)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            backgroundColor: '#0f172a',
            color: '#fff',
            overflow: 'hidden'
          }
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Chip label={previewPhoto?.category || 'Exhibit'} color="primary" size="small" sx={{ fontWeight: 700 }} />
            <Typography variant="h6" sx={{ fontWeight: 600, color: '#fff' }}>
              {previewPhoto?.caption || 'Photo Preview'}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Tooltip title="Rotate 90°">
              <IconButton onClick={() => setRotation((prev) => (prev + 90) % 360)} sx={{ color: '#fff' }}>
                <RotateRightIcon />
              </IconButton>
            </Tooltip>
            <IconButton onClick={() => setPreviewPhoto(null)} sx={{ color: '#fff' }}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent sx={{ p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 450 }}>
          {previewPhoto?.base64_preview ? (
            <img
              src={previewPhoto.base64_preview}
              alt={previewPhoto.caption}
              style={{
                maxWidth: '100%',
                maxHeight: '55vh',
                objectFit: 'contain',
                borderRadius: '8px',
                transform: `rotate(${rotation}deg)`,
                transition: 'transform 0.3s ease',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
              }}
            />
          ) : (
            <Typography variant="body1" color="grey.400">
              No high-resolution preview available.
            </Typography>
          )}

          {/* Multimodal Verification & Extracted Data Details (Gemma Vision) */}
          {previewPhoto?.vision_check && (
            <Paper
              sx={{
                width: '100%',
                mt: 2.5,
                p: 2,
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                borderRadius: 2,
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#fff'
              }}
            >
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#38bdf8', mb: 0.5 }}>
                    👁️ Gemma Vision ↔ Label Check
                  </Typography>
                  <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                    <strong>Status:</strong> {previewPhoto.vision_check.verified ? "✓ Verified Match" : "⚠ Visual Warning"} ({Math.round((previewPhoto.vision_check.confidence || 0.9) * 100)}% confidence)
                  </Typography>
                  <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                    <strong>Detected Scene:</strong> {previewPhoto.vision_check.detected_scene}
                  </Typography>
                  {previewPhoto.vision_check.visual_summary && (
                    <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'grey.300' }}>
                      "{previewPhoto.vision_check.visual_summary}"
                    </Typography>
                  )}
                  {previewPhoto.vision_check.discrepancies?.length > 0 && (
                    <Box sx={{ mt: 1, p: 1, backgroundColor: 'rgba(239, 68, 68, 0.15)', borderRadius: 1, border: '1px solid #ef4444' }}>
                      <Typography variant="caption" sx={{ color: '#fca5a5', fontWeight: 600 }}>
                        ⚠ Discrepancies: {previewPhoto.vision_check.discrepancies.join(', ')}
                      </Typography>
                    </Box>
                  )}
                </Grid>

                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#4ade80', mb: 0.5 }}>
                    📄 Gemma Whole-Image Extracted Data
                  </Typography>

                  {/* Floorplan Sketch */}
                  {previewPhoto.vision_check.extracted_data?.room_labels?.length > 0 && (
                    <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                      <strong>Detected Rooms:</strong> {previewPhoto.vision_check.extracted_data.room_labels.join(', ')}
                    </Typography>
                  )}
                  {previewPhoto.vision_check.extracted_data?.measurements?.length > 0 && (
                    <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                      <strong>Measurements:</strong> {previewPhoto.vision_check.extracted_data.measurements.slice(0, 6).join(', ')}
                    </Typography>
                  )}
                  {previewPhoto.vision_check.extracted_data?.detected_gla && (
                    <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                      <strong>Detected GLA:</strong> {previewPhoto.vision_check.extracted_data.detected_gla} sq ft
                    </Typography>
                  )}

                  {/* Maps (Flood / Aerial / Location) */}
                  {previewPhoto.vision_check.extracted_data?.flood_zone && (
                    <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                      <strong>FEMA Flood Zone:</strong> {previewPhoto.vision_check.extracted_data.flood_zone}
                    </Typography>
                  )}
                  {previewPhoto.vision_check.extracted_data?.map_panel && (
                    <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                      <strong>Map Panel / Date:</strong> {previewPhoto.vision_check.extracted_data.map_panel}
                    </Typography>
                  )}
                  {previewPhoto.vision_check.extracted_data?.street_names?.length > 0 && (
                    <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                      <strong>Street Names:</strong> {previewPhoto.vision_check.extracted_data.street_names.join(', ')}
                    </Typography>
                  )}

                  {/* Appraisal License */}
                  {previewPhoto.vision_check.extracted_data?.appraiser_name && (
                    <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                      <strong>Appraiser:</strong> {previewPhoto.vision_check.extracted_data.appraiser_name}
                    </Typography>
                  )}
                  {previewPhoto.vision_check.extracted_data?.license_number && (
                    <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                      <strong>License Number:</strong> {previewPhoto.vision_check.extracted_data.license_number} ({previewPhoto.vision_check.extracted_data.license_state || 'State'})
                    </Typography>
                  )}
                  {previewPhoto.vision_check.extracted_data?.license_expiration && (
                    <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                      <strong>License Expiration:</strong> {previewPhoto.vision_check.extracted_data.license_expiration}
                    </Typography>
                  )}

                  {/* E&O Insurance */}
                  {previewPhoto.vision_check.extracted_data?.insurance_carrier && (
                    <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                      <strong>Insurance Carrier:</strong> {previewPhoto.vision_check.extracted_data.insurance_carrier}
                    </Typography>
                  )}
                  {previewPhoto.vision_check.extracted_data?.policy_number && (
                    <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                      <strong>Policy Number:</strong> {previewPhoto.vision_check.extracted_data.policy_number}
                    </Typography>
                  )}
                  {previewPhoto.vision_check.extracted_data?.coverage_limit && (
                    <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                      <strong>Coverage Limits:</strong> {previewPhoto.vision_check.extracted_data.coverage_limit}
                    </Typography>
                  )}
                  {previewPhoto.vision_check.extracted_data?.policy_expiration && (
                    <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                      <strong>Policy Expiration:</strong> {previewPhoto.vision_check.extracted_data.policy_expiration}
                    </Typography>
                  )}

                  {/* Verbatim Extracted Text */}
                  {previewPhoto.vision_check.extracted_text && (
                    <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'grey.300', fontStyle: 'italic', maxHeight: 80, overflowY: 'auto' }}>
                      Transcription: {previewPhoto.vision_check.extracted_text.substring(0, 200)}...
                    </Typography>
                  )}
                </Grid>
              </Grid>
            </Paper>
          )}

          <Box sx={{ mt: 2, display: 'flex', gap: 3, color: 'grey.400', fontSize: '0.85rem' }}>
            <span><strong>Page:</strong> {previewPhoto?.page}</span>
            <span><strong>Dimensions:</strong> {previewPhoto?.width} × {previewPhoto?.height} pt</span>
            <span><strong>Format:</strong> {previewPhoto?.format?.toUpperCase()}</span>
          </Box>
        </DialogContent>
      </Dialog>
    </Paper>
  );
};

export default PhotosGallerySection;
