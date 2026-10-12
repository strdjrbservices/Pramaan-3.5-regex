import React, { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, CircularProgress, Grid, Stack,
  Typography,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import { API_BASE_URL } from '../Subject/utils/utils.js';

const EXHIBITS = [
  { key: 'aerial_map', label: 'Aerial map' },
  { key: 'location_map', label: 'Location map' },
  { key: 'e_and_o', label: 'E&O insurance' },
  { key: 'appraiser_license', label: 'Appraiser license' },
  { key: 'sketch', label: 'Sketch / floor plan' },
];

export default function ReportImageValidation() {
  const [images, setImages] = useState({});
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const previews = useMemo(() => Object.fromEntries(
    Object.entries(images).map(([key, file]) => [key, URL.createObjectURL(file)])
  ), [images]);

  const chooseImage = (key, file) => {
    setImages((current) => {
      if (current[key]) URL.revokeObjectURL(URL.createObjectURL(current[key]));
      if (!file) {
        const next = { ...current };
        delete next[key];
        return next;
      }
      return { ...current, [key]: file };
    });
    setResults(null);
    setError('');
  };

  const validate = async () => {
    setLoading(true);
    setResults(null);
    setError('');
    const form = new FormData();
    Object.entries(images).forEach(([key, file]) => form.append(key, file));
    try {
      const response = await fetch(`${API_BASE_URL}/api/validate-report-images/`, { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Image validation failed.');
      setResults(data.results || []);
    } catch (err) {
      setError(err.message || 'Unable to validate these images.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto', p: { xs: 2, md: 4 }, pt: 8 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" mb={1}>
        <VerifiedUserIcon color="primary" fontSize="large" />
        <Typography variant="h4" fontWeight={800}>Report image validation</Typography>
      </Stack>
      <Typography color="text.secondary" mb={3}>
        Add the exhibit images from the original report. This workflow checks the images only and returns a visual summary for each selected item.
      </Typography>
      <Grid container spacing={2}>
        {EXHIBITS.map(({ key, label }) => (
          <Grid item xs={12} sm={6} md={4} key={key}>
            <Card variant="outlined" sx={{ height: '100%', borderRadius: 3 }}>
              <CardContent>
                <Typography fontWeight={700} mb={1}>{label}</Typography>
                <Button component="label" variant="outlined" startIcon={<CloudUploadIcon />}>
                  {images[key] ? 'Replace image' : 'Choose image'}
                  <input hidden type="file" accept="image/*" onChange={(event) => chooseImage(key, event.target.files?.[0])} />
                </Button>
                {images[key] && <Typography variant="caption" display="block" mt={1} noWrap>{images[key].name}</Typography>}
                {previews[key] && <Box component="img" src={previews[key]} alt={`${label} preview`} sx={{ mt: 1.5, width: '100%', height: 160, objectFit: 'contain', bgcolor: 'grey.100', borderRadius: 1 }} />}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
      <Button sx={{ mt: 3 }} variant="contained" size="large" disabled={!Object.keys(images).length || loading} onClick={validate}>
        {loading ? <><CircularProgress size={20} sx={{ mr: 1 }} />Validating images…</> : 'Validate selected images'}
      </Button>
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      {results && <Stack spacing={2} mt={3}>
        <Typography variant="h6" fontWeight={800}>Validation results</Typography>
        {results.map((result) => (
          <Alert key={result.category} severity={result.status === 'unavailable' ? 'warning' : result.status === 'error' ? 'error' : result.matches ? 'success' : 'warning'}>
            <Typography fontWeight={700}>{result.category}: {result.status === 'complete' ? (result.matches ? 'Image matches the expected exhibit' : 'Review this image') : result.status === 'unavailable' ? 'Validation unavailable' : 'Image could not be checked'}</Typography>
            {result.summary && <Typography variant="body2">{result.summary}</Typography>}
            {result.detected_scene && <Typography variant="body2">Detected: {result.detected_scene}{result.confidence != null ? ` · Confidence ${Math.round(Number(result.confidence) * 100)}%` : ''}</Typography>}
            {result.discrepancies?.length > 0 && <Typography variant="body2">{result.discrepancies.join(' · ')}</Typography>}
            {result.message && <Typography variant="body2">{result.message}</Typography>}
          </Alert>
        ))}
      </Stack>}
    </Box>
  );
}
