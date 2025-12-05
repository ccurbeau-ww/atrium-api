import React, { useState, useEffect } from 'react';
import { MOCK_PROPERTY_DATA } from './src/mockData';

interface IntegrationConfig {
  name: string;
  description: string;
  endpoint: string;
  method: 'GET' | 'POST';
  authType: 'none' | 'api_key' | 'oauth2' | 'basic';
  apiKey: string;
  requestBody: string;
  scheduleValue: number;
  scheduleUnit: 'hours' | 'days';
}

interface FieldMapping {
  id: string;
  externalPath: string;
  internalType: 'attributes' | 'data';
  internalField: string;
}

interface MappingConfig {
  target: 'portfolio' | 'organizations';
  responseFormat: 'json' | 'positional'; // JSON with keys or positional array
  keyPath: string; // JSON path for unique ID when targeting organizations
  keyIndex: number; // Array index for unique ID when using positional format
  mappings: FieldMapping[];
}

const STEPS = [
  { number: 1, title: 'Create Integration' },
  { number: 2, title: 'API Details' },
  { number: 3, title: 'Map Data Fields' },
  { number: 4, title: 'Results' },
];

// Fake internal entity mapping (simulates your database of org key -> org name mappings)
// These map property codes to internal display names
const FAKE_INTERNAL_ENTITY_MAP: Record<string, string> = {
  // Property codes from the portfolio data
  'HNLMC': 'Waikiki Beach Marriott',
  'RENEW': 'Hotel Renew',
  'ABQMC': 'Albuquerque Marriott',
  'ATLBC': 'Atlanta Marriott Buckhead',
  'BDRSF': 'DoubleTree Stamford',
  'BWGWT': 'Holiday Inn Bowling Green',
  'CAEGS': 'Embassy Suites Columbia',
  'CHSEM': 'Embassy Suites Charleston',
  'CIDMC': 'Cedar Rapids Marriott',
  'CLTBR': 'Charlotte Airport Hilton',
  'CRWEM': 'Embassy Suites Charleston WV',
  'CVGEM': 'Holiday Inn Cincinnati',
  'DALEM': 'Embassy Suites DFW',
  'DALHS': 'Hampton Suites Mesquite',
  'DENAU': 'Crowne Plaza Denver',
  'DSMDN': 'Embassy Suites Des Moines',
  'DSMSI': 'Sheraton West Des Moines',
  'DTWWI': 'Westin Southfield',
  'DVPTR': 'Radisson Quad City',
  'FLLMC': 'Marriott Coral Springs',
  'FNLCO': 'Hilton Fort Collins',
  'FYVSP': 'Hampton Inn Springdale',
  'GSOGB': 'Embassy Suites Greensboro',
  'GSOHW': 'Homewood Suites Greensboro',
  'GSPES': 'Embassy Suites Greenville',
};

const getOrgNameFromKey = (key: string | number): string => {
  const keyStr = String(key);
  return FAKE_INTERNAL_ENTITY_MAP[keyStr] || `Property ${keyStr}`;
};

const ATTRIBUTE_FIELDS = [
  { value: 'region', label: 'Region' },
  { value: 'room_count', label: 'Room Count' },
  { value: 'brand', label: 'Brand' },
  { value: 'property_code', label: 'Property Code' },
];

const DATA_FIELDS = [
  { value: 'occupancy', label: 'Occupancy' },
];

// Helper to extract JSON paths from an object
const extractJsonPaths = (obj: unknown, prefix = '$'): string[] => {
  const paths: string[] = [];
  
  if (obj === null || obj === undefined) return paths;
  
  if (Array.isArray(obj)) {
    paths.push(`${prefix}[*]`);
    if (obj.length > 0) {
      const childPaths = extractJsonPaths(obj[0], `${prefix}[*]`);
      paths.push(...childPaths);
    }
  } else if (typeof obj === 'object') {
    Object.keys(obj).forEach((key) => {
      const newPath = `${prefix}.${key}`;
      paths.push(newPath);
      const childPaths = extractJsonPaths((obj as Record<string, unknown>)[key], newPath);
      paths.push(...childPaths);
    });
  }
  
  return paths;
};

// Helper to get the length of a positional array (handles nested arrays)
const getPositionalArrayLength = (data: unknown): number => {
  if (!data) return 0;
  
  // If it's an array of arrays (multiple records), use the first one
  if (Array.isArray(data)) {
    if (data.length === 0) return 0;
    const firstItem = data[0];
    // Check if first item is also an array (positional format)
    if (Array.isArray(firstItem)) {
      return firstItem.length;
    }
    // Single positional array
    if (typeof firstItem !== 'object' || firstItem === null) {
      return data.length;
    }
  }
  return 0;
};

// Helper to check if data appears to be positional (array of primitives or array of arrays)
const isLikelyPositionalFormat = (data: unknown): boolean => {
  if (!Array.isArray(data) || data.length === 0) return false;
  const firstItem = data[0];
  // Array of arrays (multiple positional records)
  if (Array.isArray(firstItem)) return true;
  // Single array with primitive values
  if (typeof firstItem !== 'object' || firstItem === null) return true;
  return false;
};

// Get sample values from positional array for preview
const getPositionalSampleValues = (data: unknown): (string | number | null)[] => {
  if (!Array.isArray(data) || data.length === 0) return [];
  const firstItem = data[0];
  if (Array.isArray(firstItem)) {
    return firstItem.map((v) => (typeof v === 'object' ? JSON.stringify(v) : v));
  }
  if (typeof firstItem !== 'object' || firstItem === null) {
    return data.map((v) => (typeof v === 'object' ? JSON.stringify(v) : v));
  }
  return [];
};

export default function ApiIntegrationWizard() {
  const [currentStep, setCurrentStep] = useState(1);
  const [useDemoData, setUseDemoData] = useState(true); // Demo mode enabled by default
  const [config, setConfig] = useState<IntegrationConfig>({
    name: 'Property Portfolio Feed',
    description: 'Syncs property data from external API',
    endpoint: '',
    method: 'GET',
    authType: 'none',
    apiKey: '',
    requestBody: '',
    scheduleValue: 24,
    scheduleUnit: 'hours',
  });

  // API Response state
  const [apiResponse, setApiResponse] = useState<unknown>(null);
  const [manualJsonOverride, setManualJsonOverride] = useState('');
  const [useManualJson, setUseManualJson] = useState(false);

  // Mapping configuration - default to positional format for demo data
  const [mappingConfig, setMappingConfig] = useState<MappingConfig>({
    target: 'organizations',
    responseFormat: 'positional',
    keyPath: '',
    keyIndex: 1, // Property code is at index 1
    mappings: [
      { id: '1', externalPath: '3', internalType: 'attributes', internalField: 'region' },
      { id: '2', externalPath: '19', internalType: 'data', internalField: 'occupancy' },
    ],
  });

  // Load demo data on mount when demo mode is enabled
  useEffect(() => {
    if (useDemoData) {
      setApiResponse(MOCK_PROPERTY_DATA);
    }
  }, [useDemoData]);

  const updateConfig = (field: keyof IntegrationConfig, value: string | number) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const getScheduleDisplay = () => {
    return `${config.scheduleValue} ${config.scheduleUnit}`;
  };

  // Get the parsed response data
  const getParsedData = (): unknown => {
    try {
      return useManualJson && manualJsonOverride 
        ? JSON.parse(manualJsonOverride) 
        : apiResponse;
    } catch {
      return null;
    }
  };

  // Get available JSON paths from response or manual JSON
  const getAvailablePaths = (): string[] => {
    const data = getParsedData();
    if (!data) return [];
    return extractJsonPaths(data);
  };

  // Get available indices for positional arrays
  const getAvailableIndices = (): number[] => {
    const data = getParsedData();
    const length = getPositionalArrayLength(data);
    return Array.from({ length }, (_, i) => i);
  };

  // Get sample values for positional preview
  const getSampleValues = (): (string | number | null)[] => {
    const data = getParsedData();
    return getPositionalSampleValues(data);
  };

  // Check if current data looks like positional format
  const dataLooksPositional = (): boolean => {
    const data = getParsedData();
    return isLikelyPositionalFormat(data);
  };

  // Results state
  const [resultsData, setResultsData] = useState<unknown>(null);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [isLoadingResults, setIsLoadingResults] = useState(false);

  const handleNext = () => {
    if (currentStep < 3) {
      setCurrentStep((prev) => prev + 1);
    } else if (currentStep === 3) {
      handleTestAndSave();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  // Helper to extract value from data using JSON path or positional index
  const extractValue = (data: unknown, path: string, format: 'json' | 'positional'): unknown => {
    if (!data) return null;
    
    if (format === 'positional') {
      const index = parseInt(path);
      if (Array.isArray(data)) {
        return data[index];
      }
      return null;
    }
    
    // Simple JSON path extraction (handles basic paths like $.field or $.data.field)
    try {
      const parts = path.replace(/^\$\.?/, '').split('.').filter(Boolean);
      let current: unknown = data;
      
      for (const part of parts) {
        if (current === null || current === undefined) return null;
        
        // Handle array notation like [*] or [0]
        const arrayMatch = part.match(/^(\w*)\[(\*|\d+)\]$/);
        if (arrayMatch) {
          const [, key, indexStr] = arrayMatch;
          if (key && typeof current === 'object' && current !== null) {
            current = (current as Record<string, unknown>)[key];
          }
          if (Array.isArray(current)) {
            if (indexStr === '*') {
              return current; // Return the whole array for [*]
            }
            current = current[parseInt(indexStr)];
          }
        } else if (typeof current === 'object' && current !== null) {
          current = (current as Record<string, unknown>)[part];
        }
      }
      return current;
    } catch {
      return null;
    }
  };

  // Process results data with mappings
  interface ProcessedRow {
    entityKey: string;
    orgName: string;
    mappedFields: Record<string, unknown>;
  }

  const processResultsData = (): ProcessedRow[] | Record<string, unknown> | null => {
    const data = resultsData || getParsedData();
    if (!data) return null;

    const format = mappingConfig.responseFormat;
    
    if (mappingConfig.target === 'portfolio') {
      // Single entity - just extract mapped fields
      const result: Record<string, unknown> = {};
      for (const mapping of mappingConfig.mappings) {
        const value = extractValue(data, mapping.externalPath, format);
        const fieldLabel = mapping.internalType === 'attributes' 
          ? ATTRIBUTE_FIELDS.find(f => f.value === mapping.internalField)?.label 
          : DATA_FIELDS.find(f => f.value === mapping.internalField)?.label;
        result[fieldLabel || mapping.internalField] = value;
      }
      return result;
    }

    // Organizations - process array of records
    let records: unknown[] = [];
    
    if (format === 'positional') {
      // Positional format - data is array of arrays
      if (Array.isArray(data)) {
        if (Array.isArray(data[0])) {
          records = data; // Array of arrays
        } else {
          records = [data]; // Single positional array
        }
      }
    } else {
      // JSON format - find the array in the data
      if (Array.isArray(data)) {
        records = data;
      } else {
        // Try to find an array in the response (common patterns)
        const obj = data as Record<string, unknown>;
        for (const key of ['data', 'items', 'results', 'records', 'organizations']) {
          if (Array.isArray(obj[key])) {
            records = obj[key] as unknown[];
            break;
          }
        }
        if (records.length === 0 && typeof data === 'object') {
          // Just use the object as a single record
          records = [data];
        }
      }
    }

    // Process each record
    const processedRows: ProcessedRow[] = records.map((record) => {
      // Extract entity key
      let entityKey: string;
      if (format === 'positional') {
        entityKey = String((record as unknown[])[mappingConfig.keyIndex] || 'unknown');
      } else {
        entityKey = String(extractValue(record, mappingConfig.keyPath, format) || 'unknown');
      }

      // Get org name from fake internal mapping
      const orgName = getOrgNameFromKey(entityKey);

      // Extract mapped fields
      const mappedFields: Record<string, unknown> = {};
      for (const mapping of mappingConfig.mappings) {
        const value = extractValue(record, mapping.externalPath, format);
        const fieldLabel = mapping.internalType === 'attributes' 
          ? ATTRIBUTE_FIELDS.find(f => f.value === mapping.internalField)?.label 
          : DATA_FIELDS.find(f => f.value === mapping.internalField)?.label;
        mappedFields[fieldLabel || mapping.internalField] = value;
      }

      return { entityKey, orgName, mappedFields };
    });

    return processedRows;
  };

  const handleTestAndSave = async () => {
    setIsLoadingResults(true);
    setResultsError(null);
    setResultsData(null);
    
    // Move to results step
    setCurrentStep(4);

    // Priority: 1. Demo data, 2. Manual override, 3. Live endpoint fetch, 4. Cached response
    try {
      // If demo mode is enabled, use mock data
      if (useDemoData) {
        setResultsData(MOCK_PROPERTY_DATA);
        console.log('Using demo data:', MOCK_PROPERTY_DATA.length, 'properties');
      } else if (useManualJson && manualJsonOverride && manualJsonOverride.trim()) {
        // Manual override data
        const parsedData = JSON.parse(manualJsonOverride);
        setResultsData(parsedData);
        console.log('Using manual override data:', parsedData);
      } else if (config.endpoint) {
        // Try fetching from the endpoint
        const headers: HeadersInit = {
          'Content-Type': 'application/json',
        };

        if (config.authType === 'api_key' && config.apiKey) {
          headers['Authorization'] = `Bearer ${config.apiKey}`;
        }

        const fetchOptions: RequestInit = {
          method: config.method,
          headers,
        };

        if (config.method === 'POST' && config.requestBody) {
          fetchOptions.body = config.requestBody;
        }

        const response = await fetch(config.endpoint, fetchOptions);
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
          const data = await response.json();
          setResultsData(data);
          console.log('Results Data:', data);
        } else {
          throw new Error('Response is not JSON');
        }
      } else if (apiResponse) {
        // Fall back to cached API response from Step 2 test
        setResultsData(apiResponse);
        setResultsError('Using cached response from Step 2 endpoint test.');
      } else {
        throw new Error('No endpoint configured and no manual data provided');
      }
    } catch (error) {
      console.error('Failed to fetch results:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      
      // If fetch/parse fails, try fallbacks
      if (apiResponse) {
        setResultsData(apiResponse);
        setResultsError(`Using cached response (fetch failed: ${errorMsg})`);
      } else if (manualJsonOverride && manualJsonOverride.trim()) {
        try {
          setResultsData(JSON.parse(manualJsonOverride));
          setResultsError(null);
        } catch {
          setResultsError(`Failed to parse manual data: ${errorMsg}`);
        }
      } else {
        setResultsError(`Failed to fetch data: ${errorMsg}. Use manual data override in Step 3.`);
      }
    } finally {
      setIsLoadingResults(false);
    }

    // Log the configuration
    const integrationPayload = {
      name: config.name,
      description: config.description,
      endpoint: config.endpoint,
      method: config.method,
      ...(config.method === 'POST' && config.requestBody && { body: config.requestBody }),
      authentication: {
        type: config.authType,
        ...(config.authType === 'api_key' && { apiKey: config.apiKey }),
      },
      schedule: {
        value: config.scheduleValue,
        unit: config.scheduleUnit,
      },
      mapping: {
        target: mappingConfig.target,
        responseFormat: mappingConfig.responseFormat,
        ...(mappingConfig.target === 'organizations' && mappingConfig.responseFormat === 'json' && { keyPath: mappingConfig.keyPath }),
        ...(mappingConfig.target === 'organizations' && mappingConfig.responseFormat === 'positional' && { keyIndex: mappingConfig.keyIndex }),
        fields: mappingConfig.mappings.map((m) => ({
          source: m.externalPath,
          sourceType: mappingConfig.responseFormat,
          targetType: m.internalType,
          targetField: m.internalField,
        })),
      },
    };

    console.log('Integration Configuration:', integrationPayload);
  };

  // Test the configured endpoint
  const [isTesting, setIsTesting] = useState(false);

  const testEndpoint = async () => {
    if (!config.endpoint) {
      alert('Please enter an endpoint URL first.');
      return;
    }

    try {
      new URL(config.endpoint);
    } catch {
      alert('✗ Invalid URL format\n\nPlease enter a valid URL starting with http:// or https://');
      return;
    }

    setIsTesting(true);

    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      if (config.authType === 'api_key' && config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
      }

      const fetchOptions: RequestInit = {
        method: config.method,
        headers,
      };

      if (config.method === 'POST' && config.requestBody) {
        fetchOptions.body = config.requestBody;
      }

      const response = await fetch(config.endpoint, fetchOptions);

      const contentType = response.headers.get('content-type');
      let data;
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
        setApiResponse(data);
        setUseManualJson(false);
      } else {
        data = await response.text();
      }
      
      console.log('API Response:', data);
      alert(`✓ Connection Successful!\n\nStatus: ${response.status} ${response.statusText}\n\nResponse data captured for field mapping.`);
    } catch (error) {
      console.error('API Test Failed:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError') || errorMessage.includes('CORS')) {
        alert(
          `✗ Connection Failed (CORS Error)\n\n` +
          `The browser blocked this request due to CORS policy.\n\n` +
          `You can use the manual JSON override in Step 3 to define your expected response structure.`
        );
      } else {
        alert(`✗ Connection Failed\n\n${errorMessage}`);
      }
    } finally {
      setIsTesting(false);
    }
  };

  // Mapping management
  const addMapping = () => {
    const newMapping: FieldMapping = {
      id: crypto.randomUUID(),
      externalPath: '',
      internalType: 'attributes',
      internalField: ATTRIBUTE_FIELDS[0].value,
    };
    setMappingConfig((prev) => ({
      ...prev,
      mappings: [...prev.mappings, newMapping],
    }));
  };

  const updateMapping = (id: string, field: keyof FieldMapping, value: string) => {
    setMappingConfig((prev) => ({
      ...prev,
      mappings: prev.mappings.map((m) => {
        if (m.id !== id) return m;
        
        // If changing type, reset the field to first option
        if (field === 'internalType') {
          const newType = value as 'attributes' | 'data';
          return {
            ...m,
            internalType: newType,
            internalField: newType === 'attributes' ? ATTRIBUTE_FIELDS[0].value : DATA_FIELDS[0].value,
          };
        }
        
        return { ...m, [field]: value };
      }),
    }));
  };

  const removeMapping = (id: string) => {
    setMappingConfig((prev) => ({
      ...prev,
      mappings: prev.mappings.filter((m) => m.id !== id),
    }));
  };

  const availablePaths = getAvailablePaths();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-8 font-['Outfit',sans-serif]">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-4xl font-bold tracking-tight text-white">
            Portfolio API Integration
          </h1>
          <p className="text-slate-400">
            Configure external data sources for your portfolio
          </p>
        </div>

        {/* Progress Indicator */}
        <div className="mb-10">
          <div className="flex items-center justify-center gap-4">
            {STEPS.map((step, index) => (
              <React.Fragment key={step.number}>
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl text-lg font-semibold transition-all duration-300 ${
                      currentStep === step.number
                        ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/30'
                        : currentStep > step.number
                        ? 'bg-emerald-500/20 text-emerald-400 ring-2 ring-emerald-500/40'
                        : 'bg-slate-800/60 text-slate-500 ring-1 ring-slate-700'
                    }`}
                  >
                    {currentStep > step.number ? (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      step.number
                    )}
                  </div>
                  <span
                    className={`hidden text-sm font-medium sm:block ${
                      currentStep === step.number
                        ? 'text-white'
                        : currentStep > step.number
                        ? 'text-emerald-400'
                        : 'text-slate-500'
                    }`}
                  >
                    {step.title}
                  </span>
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={`h-0.5 w-16 rounded-full transition-colors duration-300 ${
                      currentStep > step.number ? 'bg-emerald-500/50' : 'bg-slate-700'
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Main Card */}
        <div className="overflow-hidden rounded-3xl border border-slate-700/50 bg-slate-900/80 shadow-2xl backdrop-blur-sm">
          {/* Step Content */}
          <div className="p-8">
            {/* Step 1: Create Integration */}
            {currentStep === 1 && (
              <div className="space-y-8">
                <div className="text-center">
                  <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 ring-1 ring-violet-500/30">
                    <svg className="h-10 w-10 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </div>
                  <h2 className="mb-4 text-2xl font-bold text-white">
                    Create a New Integration
                  </h2>
                  <p className="mx-auto max-w-2xl text-lg leading-relaxed text-slate-400">
                    Connect your organization to external data sources through custom API integrations. 
                    Pull data from third-party services on a scheduled basis and map external fields 
                    to your internal platform attributes.
                  </p>
                </div>

                <div className="mx-auto max-w-md space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-300">
                      Integration Name
                    </label>
                    <input
                      type="text"
                      value={config.name}
                      onChange={(e) => updateConfig('name', e.target.value)}
                      placeholder="e.g., Property Occupancy Feed"
                      className="w-full rounded-xl border border-slate-600/50 bg-slate-800/60 px-4 py-3 text-white placeholder-slate-500 outline-none ring-violet-500/50 transition-all focus:border-violet-500/50 focus:ring-2"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-300">
                      Description
                    </label>
                    <textarea
                      value={config.description}
                      onChange={(e) => updateConfig('description', e.target.value)}
                      placeholder="Briefly describe what this integration does..."
                      rows={3}
                      className="w-full resize-none rounded-xl border border-slate-600/50 bg-slate-800/60 px-4 py-3 text-white placeholder-slate-500 outline-none ring-violet-500/50 transition-all focus:border-violet-500/50 focus:ring-2"
                    />
                  </div>
                </div>

                {/* Demo Mode Toggle */}
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/20">
                        <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="font-semibold text-emerald-300">Demo Mode</h4>
                        <p className="text-sm text-emerald-200/70">
                          {useDemoData 
                            ? 'Using sample property data (25 hotels)' 
                            : 'Connect to a live API endpoint'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setUseDemoData(!useDemoData)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        useDemoData ? 'bg-emerald-500' : 'bg-slate-600'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          useDemoData ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
                  <div className="flex gap-4">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-amber-500/20">
                      <svg className="h-5 w-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="mb-1 font-semibold text-amber-300">What you'll configure</h4>
                      <ul className="space-y-1 text-sm text-amber-200/70">
                        <li>• API endpoint, method, and authentication</li>
                        <li>• Data sync schedule</li>
                        <li>• Field mappings: External → Internal</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: API Details */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <div className="mb-8">
                  <h2 className="mb-2 text-2xl font-bold text-white">Specify API Details</h2>
                  <p className="text-slate-400">
                    Configure the endpoint, authentication, and schedule for data retrieval.
                  </p>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  {/* Endpoint URL */}
                  <div className="lg:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-slate-300">
                      API Endpoint URL <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="url"
                      value={config.endpoint}
                      onChange={(e) => updateConfig('endpoint', e.target.value)}
                      placeholder="https://api.example.com/v1/data"
                      className="w-full rounded-xl border border-slate-600/50 bg-slate-800/60 px-4 py-3 font-mono text-sm text-white placeholder-slate-500 outline-none ring-violet-500/50 transition-all focus:border-violet-500/50 focus:ring-2"
                    />
                  </div>

                  {/* HTTP Method */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-300">
                      HTTP Method
                    </label>
                    <select
                      value={config.method}
                      onChange={(e) => updateConfig('method', e.target.value as 'GET' | 'POST')}
                      className="w-full cursor-pointer appearance-none rounded-xl border border-slate-600/50 bg-slate-800/60 px-4 py-3 text-white outline-none ring-violet-500/50 transition-all focus:border-violet-500/50 focus:ring-2"
                    >
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                    </select>
                  </div>

                  {/* Sync Schedule */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-300">
                      Sync Schedule
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">Every</span>
                      <select
                        value={config.scheduleValue}
                        onChange={(e) => updateConfig('scheduleValue', parseInt(e.target.value))}
                        className="w-20 cursor-pointer appearance-none rounded-xl border border-slate-600/50 bg-slate-800/60 px-3 py-3 text-center text-white outline-none ring-violet-500/50 transition-all focus:border-violet-500/50 focus:ring-2"
                      >
                        {(config.scheduleUnit === 'hours'
                          ? Array.from({ length: 24 }, (_, i) => i + 1)
                          : Array.from({ length: 31 }, (_, i) => i + 1)
                        ).map((num) => (
                          <option key={num} value={num}>
                            {num}
                          </option>
                        ))}
                      </select>
                      <select
                        value={config.scheduleUnit}
                        onChange={(e) => {
                          const newUnit = e.target.value as 'hours' | 'days';
                          const maxValue = newUnit === 'hours' ? 24 : 31;
                          updateConfig('scheduleUnit', newUnit);
                          if (config.scheduleValue > maxValue) {
                            updateConfig('scheduleValue', maxValue);
                          }
                        }}
                        className="w-24 cursor-pointer appearance-none rounded-xl border border-slate-600/50 bg-slate-800/60 px-3 py-3 text-white outline-none ring-violet-500/50 transition-all focus:border-violet-500/50 focus:ring-2"
                      >
                        <option value="hours">hours</option>
                        <option value="days">days</option>
                      </select>
                    </div>
                  </div>

                  {/* Authorization Type */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-300">
                      Authorization Type
                    </label>
                    <select
                      value={config.authType}
                      onChange={(e) => updateConfig('authType', e.target.value as 'none' | 'api_key' | 'oauth2' | 'basic')}
                      className="w-full cursor-pointer appearance-none rounded-xl border border-slate-600/50 bg-slate-800/60 px-4 py-3 text-white outline-none ring-violet-500/50 transition-all focus:border-violet-500/50 focus:ring-2"
                    >
                      <option value="none">No Auth</option>
                      <option value="api_key">API Key</option>
                      <option value="oauth2">OAuth 2.0</option>
                      <option value="basic">Basic Auth</option>
                    </select>
                  </div>

                  {/* API Key Input (conditional) */}
                  {config.authType === 'api_key' && (
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-300">
                        API Key
                      </label>
                      <input
                        type="password"
                        value={config.apiKey}
                        onChange={(e) => updateConfig('apiKey', e.target.value)}
                        placeholder="Enter your API key"
                        className="w-full rounded-xl border border-slate-600/50 bg-slate-800/60 px-4 py-3 font-mono text-sm text-white placeholder-slate-500 outline-none ring-violet-500/50 transition-all focus:border-violet-500/50 focus:ring-2"
                      />
                    </div>
                  )}

                  {/* Request Body (conditional - POST only) */}
                  {config.method === 'POST' && (
                    <div className="lg:col-span-2">
                      <label className="mb-2 block text-sm font-medium text-slate-300">
                        Request Body (JSON)
                      </label>
                      <textarea
                        value={config.requestBody}
                        onChange={(e) => updateConfig('requestBody', e.target.value)}
                        placeholder='{"key": "value"}'
                        rows={5}
                        className="w-full resize-none rounded-xl border border-slate-600/50 bg-slate-800/60 px-4 py-3 font-mono text-sm text-white placeholder-slate-500 outline-none ring-violet-500/50 transition-all focus:border-violet-500/50 focus:ring-2"
                      />
                    </div>
                  )}
                </div>

                {/* Test Endpoint Button */}
                <div className="mt-6">
                  <button
                    onClick={testEndpoint}
                    disabled={isTesting}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-5 py-3 text-sm font-medium text-cyan-400 transition-all hover:border-cyan-500/50 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isTesting ? (
                      <>
                        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Testing...
                      </>
                    ) : (
                      <>
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Test Endpoint Connection
                      </>
                    )}
                  </button>
                  {apiResponse !== null && (
                    <p className="mt-2 text-center text-xs text-emerald-400">
                      ✓ Response captured — available for field mapping in Step 3
                    </p>
                  )}
                  <p className="mt-2 text-center text-xs text-slate-500">
                    Note: Some APIs may block browser requests due to CORS. Use manual data override in Step 3 if needed.
                  </p>
                </div>
              </div>
            )}

            {/* Step 3: Map Data Fields */}
            {currentStep === 3 && (
              <div className="space-y-6">
                <div className="mb-8">
                  <h2 className="mb-2 text-2xl font-bold text-white">Map Data Fields</h2>
                  <p className="text-slate-400">
                    Define how external API data maps to your internal platform fields.
                  </p>
                </div>

                {/* Manual JSON Override */}
                <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="text-sm font-medium text-slate-300">Response Data Source</span>
                    </div>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={useManualJson}
                        onChange={(e) => setUseManualJson(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-violet-500 focus:ring-violet-500"
                      />
                      <span className="text-sm text-slate-400">Use manual data override</span>
                    </label>
                  </div>
                  
                  {useManualJson ? (
                    <div>
                      <textarea
                        value={manualJsonOverride}
                        onChange={(e) => setManualJsonOverride(e.target.value)}
                        placeholder={'Paste expected API response data here...\n\nJSON: {"data": [{"id": "123", "occupancy": 85}]}\n\nPositional: [[1, "RENEW", "Hotel", 72], [2, "HYATT", "Resort", 85]]'}
                        rows={6}
                        className="w-full resize-none rounded-xl border border-slate-600/50 bg-slate-800/60 px-4 py-3 font-mono text-xs text-white placeholder-slate-500 outline-none ring-violet-500/50 transition-all focus:border-violet-500/50 focus:ring-2"
                      />
                      <p className="mt-2 text-xs text-slate-500">
                        Paste expected response data (JSON or positional array) to define available fields for mapping
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-slate-900/50 p-4">
                      {apiResponse ? (
                        <div>
                          <p className="mb-2 text-xs text-emerald-400">✓ Using response from endpoint test</p>
                          <pre className="max-h-32 overflow-auto rounded-lg bg-slate-950/50 p-3 font-mono text-xs text-slate-400">
                            {JSON.stringify(apiResponse, null, 2).slice(0, 500)}
                            {JSON.stringify(apiResponse, null, 2).length > 500 && '...'}
                          </pre>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500">
                          No response data available. Test the endpoint in Step 2 or enable manual JSON override.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Response Format */}
                <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5">
                  <h4 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-300">
                    <svg className="h-4 w-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                    </svg>
                    Response Format
                  </h4>
                  
                  <div className="flex gap-3">
                    <button
                      onClick={() => setMappingConfig((prev) => ({ ...prev, responseFormat: 'json' }))}
                      className={`flex-1 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                        mappingConfig.responseFormat === 'json'
                          ? 'bg-violet-500/20 text-violet-300 ring-2 ring-violet-500/40'
                          : 'bg-slate-800/60 text-slate-400 hover:bg-slate-700/60'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        JSON (Keyed)
                      </div>
                      <p className="mt-1 text-xs opacity-70">{"{ \"field\": \"value\" }"}</p>
                    </button>
                    <button
                      onClick={() => setMappingConfig((prev) => ({ ...prev, responseFormat: 'positional' }))}
                      className={`flex-1 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                        mappingConfig.responseFormat === 'positional'
                          ? 'bg-violet-500/20 text-violet-300 ring-2 ring-violet-500/40'
                          : 'bg-slate-800/60 text-slate-400 hover:bg-slate-700/60'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                        </svg>
                        Positional (Array)
                      </div>
                      <p className="mt-1 text-xs opacity-70">[val1, val2, val3, ...]</p>
                    </button>
                  </div>

                  {/* Auto-detection hint */}
                  {(apiResponse || manualJsonOverride) && dataLooksPositional() && mappingConfig.responseFormat === 'json' && (
                    <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                      <p className="text-xs text-amber-300">
                        💡 Your data appears to be in positional array format. Consider switching to "Positional (Array)" for easier mapping.
                      </p>
                    </div>
                  )}

                  {/* Positional array preview */}
                  {mappingConfig.responseFormat === 'positional' && getSampleValues().length > 0 && (
                    <div className="mt-4 rounded-xl bg-slate-900/50 p-4">
                      <p className="mb-2 text-xs text-slate-400">Array preview (showing indices):</p>
                      <div className="flex flex-wrap gap-2">
                        {getSampleValues().slice(0, 20).map((value, idx) => (
                          <div key={idx} className="rounded-lg bg-slate-800/80 px-2 py-1">
                            <span className="font-mono text-xs text-fuchsia-400">[{idx}]</span>
                            <span className="ml-1 text-xs text-slate-400">
                              {String(value).length > 15 ? String(value).slice(0, 15) + '...' : String(value)}
                            </span>
                          </div>
                        ))}
                        {getSampleValues().length > 20 && (
                          <span className="text-xs text-slate-500">...and {getSampleValues().length - 20} more</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Mapping Target */}
                <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5">
                  <h4 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-300">
                    <svg className="h-4 w-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    Apply Mapping To
                  </h4>
                  
                  <div className="mb-4 flex gap-3">
                    <button
                      onClick={() => setMappingConfig((prev) => ({ ...prev, target: 'portfolio' }))}
                      className={`flex-1 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                        mappingConfig.target === 'portfolio'
                          ? 'bg-violet-500/20 text-violet-300 ring-2 ring-violet-500/40'
                          : 'bg-slate-800/60 text-slate-400 hover:bg-slate-700/60'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        Portfolio
                      </div>
                      <p className="mt-1 text-xs opacity-70">Single entity, no array</p>
                    </button>
                    <button
                      onClick={() => setMappingConfig((prev) => ({ ...prev, target: 'organizations' }))}
                      className={`flex-1 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                        mappingConfig.target === 'organizations'
                          ? 'bg-violet-500/20 text-violet-300 ring-2 ring-violet-500/40'
                          : 'bg-slate-800/60 text-slate-400 hover:bg-slate-700/60'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Organizations
                      </div>
                      <p className="mt-1 text-xs opacity-70">Array of elements</p>
                    </button>
                  </div>

                  {/* Key Path/Index for Organizations */}
                  {mappingConfig.target === 'organizations' && (
                    <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                      <label className="mb-2 block text-sm font-medium text-amber-300">
                        Entity Key {mappingConfig.responseFormat === 'json' ? '(JSON Path)' : '(Array Index)'}
                      </label>
                      <p className="mb-3 text-xs text-amber-200/70">
                        {mappingConfig.responseFormat === 'json' 
                          ? 'JSON path to the unique identifier that links external entities to internal organization IDs'
                          : 'Array index position containing the unique identifier for each record'
                        }
                      </p>
                      
                      {mappingConfig.responseFormat === 'json' ? (
                        // JSON format - path selector
                        availablePaths.length > 0 ? (
                          <select
                            value={mappingConfig.keyPath}
                            onChange={(e) => setMappingConfig((prev) => ({ ...prev, keyPath: e.target.value }))}
                            className="w-full cursor-pointer appearance-none rounded-lg border border-amber-500/30 bg-slate-800/60 px-3 py-2 font-mono text-sm text-white outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20"
                          >
                            <option value="">Select key path...</option>
                            {availablePaths.map((path) => (
                              <option key={path} value={path}>
                                {path}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={mappingConfig.keyPath}
                            onChange={(e) => setMappingConfig((prev) => ({ ...prev, keyPath: e.target.value }))}
                            placeholder="$.data[*].external_id"
                            className="w-full rounded-lg border border-amber-500/30 bg-slate-800/60 px-3 py-2 font-mono text-sm text-white placeholder-slate-500 outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20"
                          />
                        )
                      ) : (
                        // Positional format - index selector
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-amber-200/70">Index:</span>
                          {getAvailableIndices().length > 0 ? (
                            <select
                              value={mappingConfig.keyIndex}
                              onChange={(e) => setMappingConfig((prev) => ({ ...prev, keyIndex: parseInt(e.target.value) }))}
                              className="w-24 cursor-pointer appearance-none rounded-lg border border-amber-500/30 bg-slate-800/60 px-3 py-2 font-mono text-sm text-white outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20"
                            >
                              {getAvailableIndices().map((idx) => (
                                <option key={idx} value={idx}>
                                  [{idx}]
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="number"
                              min="0"
                              value={mappingConfig.keyIndex}
                              onChange={(e) => setMappingConfig((prev) => ({ ...prev, keyIndex: parseInt(e.target.value) || 0 }))}
                              className="w-24 rounded-lg border border-amber-500/30 bg-slate-800/60 px-3 py-2 font-mono text-sm text-white outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20"
                            />
                          )}
                          {getSampleValues()[mappingConfig.keyIndex] !== undefined && (
                            <span className="text-xs text-amber-200/50">
                              = "{String(getSampleValues()[mappingConfig.keyIndex]).slice(0, 20)}"
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Field Mappings */}
                <div className="rounded-2xl border border-slate-700/50">
                  <div className="flex items-center justify-between border-b border-slate-700/50 bg-slate-800/50 px-6 py-4">
                    <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-300">
                      <svg className="h-4 w-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                      </svg>
                      Field Mappings
                    </h4>
                    <button
                      onClick={addMapping}
                      className="flex items-center gap-1 rounded-lg bg-violet-500/20 px-3 py-1.5 text-xs font-medium text-violet-300 transition-all hover:bg-violet-500/30"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add Mapping
                    </button>
                  </div>

                  {mappingConfig.mappings.length === 0 ? (
                    <div className="px-6 py-8 text-center">
                      <svg className="mx-auto mb-3 h-10 w-10 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                      </svg>
                      <p className="text-sm text-slate-500">No field mappings configured</p>
                      <button
                        onClick={addMapping}
                        className="mt-3 text-sm text-violet-400 hover:text-violet-300"
                      >
                        + Add your first mapping
                      </button>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-700/30">
                      {mappingConfig.mappings.map((mapping, index) => (
                        <div key={mapping.id} className="p-4">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-500">Mapping {index + 1}</span>
                            <button
                              onClick={() => removeMapping(mapping.id)}
                              className="text-slate-500 hover:text-rose-400"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                          
                          <div className="grid gap-3 sm:grid-cols-4">
                            {/* External Path or Index */}
                            <div className="sm:col-span-2">
                              <label className="mb-1 block text-xs text-slate-500">
                                Your API Field {mappingConfig.responseFormat === 'json' ? '(JSON Path)' : '(Index)'}
                              </label>
                              
                              {mappingConfig.responseFormat === 'json' ? (
                                // JSON format - path selector
                                availablePaths.length > 0 ? (
                                  <select
                                    value={mapping.externalPath}
                                    onChange={(e) => updateMapping(mapping.id, 'externalPath', e.target.value)}
                                    className="w-full cursor-pointer appearance-none rounded-lg border border-slate-600/50 bg-slate-800/60 px-3 py-2 font-mono text-xs text-white outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
                                  >
                                    <option value="">Select field...</option>
                                    {availablePaths.map((path) => (
                                      <option key={path} value={path}>
                                        {path}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    type="text"
                                    value={mapping.externalPath}
                                    onChange={(e) => updateMapping(mapping.id, 'externalPath', e.target.value)}
                                    placeholder="$.data[*].field"
                                    className="w-full rounded-lg border border-slate-600/50 bg-slate-800/60 px-3 py-2 font-mono text-xs text-white placeholder-slate-500 outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
                                  />
                                )
                              ) : (
                                // Positional format - index selector
                                <div className="flex items-center gap-2">
                                  {getAvailableIndices().length > 0 ? (
                                    <select
                                      value={mapping.externalPath}
                                      onChange={(e) => updateMapping(mapping.id, 'externalPath', e.target.value)}
                                      className="w-full cursor-pointer appearance-none rounded-lg border border-slate-600/50 bg-slate-800/60 px-3 py-2 font-mono text-xs text-white outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
                                    >
                                      <option value="">Select index...</option>
                                      {getAvailableIndices().map((idx) => {
                                        const sampleVal = getSampleValues()[idx];
                                        const preview = sampleVal !== undefined 
                                          ? ` → ${String(sampleVal).slice(0, 20)}${String(sampleVal).length > 20 ? '...' : ''}`
                                          : '';
                                        return (
                                          <option key={idx} value={String(idx)}>
                                            [{idx}]{preview}
                                          </option>
                                        );
                                      })}
                                    </select>
                                  ) : (
                                    <input
                                      type="number"
                                      min="0"
                                      value={mapping.externalPath}
                                      onChange={(e) => updateMapping(mapping.id, 'externalPath', e.target.value)}
                                      placeholder="0"
                                      className="w-full rounded-lg border border-slate-600/50 bg-slate-800/60 px-3 py-2 font-mono text-xs text-white placeholder-slate-500 outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
                                    />
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Internal Type */}
                            <div>
                              <label className="mb-1 block text-xs text-slate-500">Type</label>
                              <select
                                value={mapping.internalType}
                                onChange={(e) => updateMapping(mapping.id, 'internalType', e.target.value)}
                                className="w-full cursor-pointer appearance-none rounded-lg border border-slate-600/50 bg-slate-800/60 px-3 py-2 text-xs text-white outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
                              >
                                <option value="attributes">Attribute</option>
                                <option value="data">Data</option>
                              </select>
                            </div>

                            {/* Internal Field */}
                            <div>
                              <label className="mb-1 block text-xs text-slate-500">Nexa Field</label>
                              <select
                                value={mapping.internalField}
                                onChange={(e) => updateMapping(mapping.id, 'internalField', e.target.value)}
                                className="w-full cursor-pointer appearance-none rounded-lg border border-slate-600/50 bg-slate-800/60 px-3 py-2 text-xs text-white outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
                              >
                                {(mapping.internalType === 'attributes' ? ATTRIBUTE_FIELDS : DATA_FIELDS).map((field) => (
                                  <option key={field.value} value={field.value}>
                                    {field.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Summary */}
                <div className="grid gap-4 sm:grid-cols-4">
                  <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
                    <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
                      Endpoint
                    </div>
                    <div className="truncate font-mono text-sm text-white">
                      {config.endpoint || '—'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
                    <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
                      Target
                    </div>
                    <div className="text-sm font-semibold capitalize text-white">{mappingConfig.target}</div>
                  </div>
                  <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
                    <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
                      Mappings
                    </div>
                    <div className="text-sm text-white">{mappingConfig.mappings.length} field(s)</div>
                  </div>
                  <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
                    <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
                      Schedule
                    </div>
                    <div className="text-sm text-white">Every {getScheduleDisplay()}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Results */}
            {currentStep === 4 && (
              <div className="space-y-6">
                <div className="mb-8">
                  <h2 className="mb-2 text-2xl font-bold text-white">Integration Results</h2>
                  <p className="text-slate-400">
                    Preview of mapped data from your API integration.
                  </p>
                </div>

                {/* Loading State */}
                {isLoadingResults && (
                  <div className="flex flex-col items-center justify-center py-12">
                    <svg className="mb-4 h-12 w-12 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <p className="text-slate-400">Fetching data from endpoint...</p>
                  </div>
                )}

                {/* Error State */}
                {resultsError && !isLoadingResults && (
                  <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
                    <div className="flex gap-4">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-amber-500/20">
                        <svg className="h-5 w-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="mb-1 font-semibold text-amber-300">Notice</h4>
                        <p className="text-sm text-amber-200/70">{resultsError}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Results Display */}
                {!isLoadingResults && (resultsData !== null || getParsedData() !== null) && (
                  <>
                    {/* Configuration Summary */}
                    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5">
                      <h4 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-300">
                        <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Integration Configured Successfully
                      </h4>
                      <div className="grid gap-3 text-sm sm:grid-cols-3">
                        <div>
                          <span className="text-slate-500">Target:</span>
                          <span className="ml-2 font-medium capitalize text-white">{mappingConfig.target}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Format:</span>
                          <span className="ml-2 font-medium text-white">{mappingConfig.responseFormat === 'json' ? 'JSON' : 'Positional'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Schedule:</span>
                          <span className="ml-2 font-medium text-white">Every {getScheduleDisplay()}</span>
                        </div>
                      </div>
                    </div>

                    {/* Results Content */}
                    {mappingConfig.target === 'portfolio' ? (
                      // Portfolio - Single entity view
                      <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5">
                        <h4 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-300">
                          <svg className="h-4 w-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                          Portfolio Data
                        </h4>
                        <div className="space-y-3">
                          {(() => {
                            const data = processResultsData() as Record<string, unknown> | null;
                            if (!data || Array.isArray(data)) return <p className="text-slate-500">No data available</p>;
                            return Object.entries(data).map(([key, value]) => (
                              <div key={key} className="flex items-center justify-between rounded-lg bg-slate-900/50 px-4 py-3">
                                <span className="text-sm font-medium text-slate-400">{key}</span>
                                <span className="font-mono text-sm text-white">{String(value ?? '—')}</span>
                              </div>
                            ));
                          })()}
                        </div>
                      </div>
                    ) : (
                      // Organizations - Table view
                      <div className="rounded-2xl border border-slate-700/50 overflow-hidden">
                        <div className="border-b border-slate-700/50 bg-slate-800/50 px-6 py-4">
                          <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-300">
                            <svg className="h-4 w-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            Organizations Data
                          </h4>
                        </div>
                        
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-slate-700/30 bg-slate-800/30">
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                                  Organization
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                                  External Key
                                </th>
                                {mappingConfig.mappings.map((mapping) => {
                                  const fieldLabel = mapping.internalType === 'attributes' 
                                    ? ATTRIBUTE_FIELDS.find(f => f.value === mapping.internalField)?.label 
                                    : DATA_FIELDS.find(f => f.value === mapping.internalField)?.label;
                                  return (
                                    <th key={mapping.id} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                                      {fieldLabel || mapping.internalField}
                                    </th>
                                  );
                                })}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/20">
                              {(() => {
                                const rows = processResultsData() as ProcessedRow[] | null;
                                if (!rows || !Array.isArray(rows) || rows.length === 0) {
                                  return (
                                    <tr>
                                      <td colSpan={2 + mappingConfig.mappings.length} className="px-4 py-8 text-center text-slate-500">
                                        No organization data available
                                      </td>
                                    </tr>
                                  );
                                }
                                return rows.map((row, idx) => (
                                  <tr key={idx} className="hover:bg-slate-800/30">
                                    <td className="px-4 py-3">
                                      <div className="flex items-center gap-3">
                                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20">
                                          <span className="text-xs font-semibold text-violet-300">
                                            {row.orgName.charAt(0)}
                                          </span>
                                        </div>
                                        <span className="font-medium text-white">{row.orgName}</span>
                                      </div>
                                    </td>
                                    <td className="px-4 py-3">
                                      <code className="rounded bg-slate-800/80 px-2 py-1 font-mono text-xs text-fuchsia-300">
                                        {row.entityKey}
                                      </code>
                                    </td>
                                    {mappingConfig.mappings.map((mapping) => {
                                      const fieldLabel = mapping.internalType === 'attributes' 
                                        ? ATTRIBUTE_FIELDS.find(f => f.value === mapping.internalField)?.label 
                                        : DATA_FIELDS.find(f => f.value === mapping.internalField)?.label;
                                      const value = row.mappedFields[fieldLabel || mapping.internalField];
                                      return (
                                        <td key={mapping.id} className="px-4 py-3 font-mono text-sm text-slate-300">
                                          {String(value ?? '—')}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ));
                              })()}
                            </tbody>
                          </table>
                        </div>

                        {/* Results Summary */}
                        {(() => {
                          const rows = processResultsData() as ProcessedRow[] | null;
                          if (rows && Array.isArray(rows)) {
                            return (
                              <div className="border-t border-slate-700/30 bg-slate-800/20 px-6 py-3">
                                <p className="text-xs text-slate-500">
                                  Showing {rows.length} organization{rows.length !== 1 ? 's' : ''} • 
                                  {mappingConfig.mappings.length} mapped field{mappingConfig.mappings.length !== 1 ? 's' : ''}
                                </p>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    )}

                    {/* Raw Data Preview */}
                    <details className="rounded-2xl border border-slate-700/50 bg-slate-800/30">
                      <summary className="cursor-pointer px-5 py-4 text-sm font-medium text-slate-400 hover:text-white">
                        View Raw Response Data
                      </summary>
                      <div className="border-t border-slate-700/30 p-5">
                        <pre className="max-h-64 overflow-auto rounded-xl bg-slate-900/80 p-4 font-mono text-xs text-slate-400">
                          {JSON.stringify(resultsData || getParsedData(), null, 2)}
                        </pre>
                      </div>
                    </details>
                  </>
                )}

                {/* No Data State */}
                {!isLoadingResults && resultsData === null && getParsedData() === null && !resultsError && (
                  <div className="flex flex-col items-center justify-center py-12">
                    <svg className="mb-4 h-16 w-16 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                    <p className="mb-2 text-lg font-medium text-slate-400">No data available</p>
                    <p className="text-sm text-slate-500">
                      Go back to Step 2 to test the endpoint or use manual data override in Step 3.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Navigation */}
          <div className="flex items-center justify-between border-t border-slate-700/50 bg-slate-800/30 px-8 py-5">
            <button
              onClick={handlePrevious}
              disabled={currentStep === 1}
              className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-all ${
                currentStep === 1
                  ? 'cursor-not-allowed text-slate-600'
                  : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'
              }`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {currentStep === 4 ? 'Edit Mappings' : 'Previous'}
            </button>

            {currentStep === 4 ? (
              <button
                onClick={() => {
                  alert('✓ Integration saved!\n\nYour integration configuration has been saved and will sync every ' + getScheduleDisplay() + '.');
                }}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition-all hover:shadow-emerald-500/40 hover:brightness-110"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Save Integration
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition-all hover:shadow-violet-500/40 hover:brightness-110"
              >
                {currentStep === 3 ? (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Test and Save
                  </>
                ) : (
                  <>
                    Next
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Footer Info */}
        <div className="mt-6 text-center text-sm text-slate-500">
          Data syncs automatically every {getScheduleDisplay()}
        </div>
      </div>
    </div>
  );
}
