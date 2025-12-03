'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type Asset = {
  id: string;
  title: string;
  status: string | null;
  brand: string | null;
  model_name: string | null;
  serial_number: string | null;
  purchase_price: number | null;
  purchase_currency: string | null;
  purchase_date: string | null;
  current_estimated_value: number | null;
  estimate_currency: string | null;
  purchase_url: string | null;
  receipt_url: string | null;
  notes_internal: string | null;
  current_condition: string | null;
  asset_type_id: string | null;
  category?: { name: string | null }[] | null;
};

type Valuation = {
  id: string;
  suggested_value: number | null;
  currency: string | null;
  valuation_source: string | null;
  created_at: string;
};

type AssetType = {
  id: string;
  brand: string | null;
  model_family: string | null;
  model_code: string | null;
  variant: string | null;
  model_year: number | null;
};

type Ingestion = {
  id: string;
  status: string;
  created_at: string;
  finished_at: string | null;
};

type IdentityLevel = 'unknown' | 'basic' | 'good' | 'strong';

function getCategoryName(asset: Asset | null) {
  if (!asset || !asset.category || asset.category.length === 0) return '—';
  return asset.category[0]?.name ?? '—';
}

function computeIdentity(asset: Asset | null): {
  level: IdentityLevel;
  label: string;
  description: string;
  colorClass: string;
} {
  if (!asset) {
    return {
      level: 'unknown',
      label: 'Identity: Unknown',
      description:
        'Round does not have enough information to identify this asset yet.',
      colorClass: 'bg-slate-100 text-slate-700 border-slate-200',
    };
  }

  if (asset.asset_type_id) {
    return {
      level: 'strong',
      label: 'Identity: Exact match',
      description:
        'This asset is linked to a catalog identity. Round can treat this as an exact match when comparing and valuing.',
      colorClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    };
  }

  let score = 0;

  const categoryName = getCategoryName(asset);
  const hasCategory = !!categoryName && categoryName !== '—';
  const hasBrand = !!asset.brand;
  const hasModel = !!asset.model_name;
  const hasSerial = !!asset.serial_number;

  if (hasCategory) score++;
  if (hasBrand) score++;
  if (hasModel) score++;
  if (hasSerial) score++;

  if (score >= 4) {
    return {
      level: 'strong',
      label: 'Identity: Strong match',
      description:
        'Round has brand, model, category and a unique identifier. This asset is ready for confident comparisons and valuations.',
      colorClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    };
  }

  if (score >= 2) {
    return {
      level: 'good',
      label: 'Identity: Good',
      description:
        'Round has enough information to compare this asset, but adding any missing details will improve accuracy further.',
      colorClass: 'bg-blue-100 text-blue-800 border-blue-200',
    };
  }

  if (score >= 1) {
    return {
      level: 'basic',
      label: 'Identity: Basic',
      description:
        'Round has a starting point for this asset, but needs brand and model to really know what it is.',
      colorClass: 'bg-amber-100 text-amber-800 border-amber-200',
    };
  }

  return {
    level: 'unknown',
    label: 'Identity: Unknown',
    description:
      'Round does not have enough information to identify this asset yet.',
    colorClass: 'bg-slate-100 text-slate-700 border-slate-200',
  };
}

/**
 * Infer a simple "value profile" from the category name.
 * - APPRECIATING: property / home etc.
 * - DEPRECIATING: cars, electronics, gadgets, etc.
 * - NEUTRAL: everything else.
 */
type ValueProfile = 'APPRECIATING' | 'DEPRECIATING' | 'NEUTRAL';

function inferValueProfile(categoryName: string | null): ValueProfile {
  const cat = (categoryName || '').toLowerCase();

  // Appreciating assets – property & similar
  const appreciatingKeywords = [
    'property',
    'home',
    'house',
    'apartment',
    'flat',
    'real estate',
    'real-estate',
  ];
  if (appreciatingKeywords.some(k => cat.includes(k))) {
    return 'APPRECIATING';
  }

  // Depreciating assets – cars, electronics, gadgets
  const depreciatingKeywords = [
    'car',
    'vehicle',
    'van',
    'motorbike',
    'bike',
    'electronics',
    'phone',
    'laptop',
    'computer',
    'desktop',
    'monitor',
    'screen',
    'tv',
    'television',
    'camera',
    'console',
    'tablet',
    'headphones',
    'speaker',
    'audio',
  ];
  if (depreciatingKeywords.some(k => cat.includes(k))) {
    return 'DEPRECIATING';
  }

  // Everything else – neutral / slow change
  return 'NEUTRAL';
}

/**
 * Simple rule-based valuation used by "Process Magic Import (demo)".
 * It uses three profiles:
 *  - APPRECIATING: gentle growth (e.g. property)
 *  - DEPRECIATING: faster drop then flatten
 *  - NEUTRAL: mild decline
 *
 * This is a placeholder until we plug in real market data & AI.
 */
function computeRuleBasedValuation(asset: Asset): {
  value: number;
  currency: string;
  source: string;
} {
  const categoryName = getCategoryName(asset);
  const profile = inferValueProfile(categoryName);

  const baseCurrency =
    asset.purchase_currency || asset.estimate_currency || 'GBP';
  const basePrice =
    asset.purchase_price ?? asset.current_estimated_value ?? 100;

  // Years since purchase
  let years = 1;
  if (asset.purchase_date) {
    const purchaseDate = new Date(asset.purchase_date);
    if (!isNaN(purchaseDate.getTime())) {
      const now = new Date();
      const diffMs = now.getTime() - purchaseDate.getTime();
      years = Math.max(0, diffMs / (1000 * 60 * 60 * 24 * 365.25));
    }
  }

  const condition = (asset.current_condition || 'unknown').toLowerCase();

  // Condition multipliers (standard)
  const conditionMultipliers: Record<string, number> = {
    like_new: 1.0,
    'like new': 1.0,
    excellent: 1.05,
    good: 0.9,
    fair: 0.8,
    poor: 0.65,
    unknown: 0.85,
  };
  const conditionMultiplier =
    conditionMultipliers[condition] ?? conditionMultipliers['unknown'];

  let value = basePrice;
  let profileLabel = '';

  if (profile === 'APPRECIATING') {
    // Appreciating assets – assume ~4% annual growth as a placeholder
    const growthRate = 0.04;
    value = basePrice * Math.pow(1 + growthRate, years);

    // Softer condition adjustment
    const softConditionMultipliers: Record<string, number> = {
      like_new: 1.05,
      excellent: 1.05,
      good: 1.0,
      fair: 0.97,
      poor: 0.93,
      unknown: 0.98,
    };
    const softMultiplier =
      softConditionMultipliers[condition] ??
      softConditionMultipliers['unknown'];
    value = value * softMultiplier;

    // Cap so demo doesn’t get silly (e.g. 3x purchase)
    const cap = basePrice * 3;
    if (value > cap) value = cap;

    profileLabel = 'appreciating asset (e.g. property)';
  } else if (profile === 'DEPRECIATING') {
    // Depreciating assets – faster early drop, then slower
    const earlyYears = Math.min(years, 3);
    const laterYears = Math.max(years - 3, 0);

    // ~25% per year for first 3 years
    value = basePrice * Math.pow(1 - 0.25, earlyYears);

    // ~10% per year afterwards
    value = value * Math.pow(1 - 0.1, laterYears);

    // Floor at 10% of original
    const floor = basePrice * 0.1;
    if (value < floor) value = floor;

    // Standard condition multiplier
    value = value * conditionMultiplier;

    profileLabel = 'depreciating asset (e.g. car / electronics)';
  } else {
    // NEUTRAL – mild decline over time
    const neutralRate = 0.1; // 10% per year
    value = basePrice * Math.pow(1 - neutralRate, years);

    // Floor at 30% of original
    const floor = basePrice * 0.3;
    if (value < floor) value = floor;

    // Standard condition multiplier
    value = value * conditionMultiplier;

    profileLabel = 'neutral asset (slow change)';
  }

  return {
    value,
    currency: baseCurrency,
    source: `Magic Import demo – rule-based valuation (${profileLabel}, age + condition)`,
  };
}

export default function AssetDetailPage() {
  const router = useRouter();
  const params = useParams() as { id: string };
  const assetId = params.id;

  const [asset, setAsset] = useState<Asset | null>(null);
  const [valuations, setValuations] = useState<Valuation[]>([]);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [relatedAssets, setRelatedAssets] = useState<Asset[]>([]);
  const [selectedAssetTypeId, setSelectedAssetTypeId] = useState<string | ''>(
    ''
  );
  const [userId, setUserId] = useState<string | null>(null);

  const [ingestions, setIngestions] = useState<Ingestion[]>([]);
  const [creatingIngestion, setCreatingIngestion] = useState(false);
  const [processingMagic, setProcessingMagic] = useState(false);
  const [ingestionError, setIngestionError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [newValue, setNewValue] = useState('');
  const [newCurrency, setNewCurrency] = useState('GBP');
  const [newSource, setNewSource] = useState('Manual – entered by you');
  const [savingValuation, setSavingValuation] = useState(false);
  const [valuationError, setValuationError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState(false);

  const [savingAssetType, setSavingAssetType] = useState(false);
  const [assetTypeError, setAssetTypeError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setPageError(null);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        setPageError('Could not check authentication.');
        setLoading(false);
        return;
      }

      if (!user) {
        router.push('/login');
        return;
      }

      setUserId(user.id);

      // Load asset
      const { data: assetData, error: assetError } = await supabase
        .from('assets')
        .select(
          `
          id,
          title,
          status,
          brand,
          model_name,
          serial_number,
          purchase_price,
          purchase_currency,
          purchase_date,
          current_estimated_value,
          estimate_currency,
          purchase_url,
          receipt_url,
          notes_internal,
          current_condition,
          asset_type_id,
          category:categories ( name )
        `
        )
        .eq('id', assetId)
        .eq('owner_id', user.id)
        .single();

      if (assetError || !assetData) {
        setPageError('Could not find this asset.');
        setLoading(false);
        return;
      }

      const typedAsset = assetData as Asset;
      setAsset(typedAsset);
      setSelectedAssetTypeId(typedAsset.asset_type_id ?? '');

      // Load valuations
      const { data: valuationData, error: valuationError } = await supabase
        .from('valuations')
        .select('id, suggested_value, currency, valuation_source, created_at')
        .eq('asset_id', assetId)
        .order('created_at', { ascending: false });

      if (!valuationError && valuationData) {
        setValuations(valuationData as Valuation[]);
      }

      // Load asset types (catalog)
      const { data: typesData, error: typesError } = await supabase
        .from('asset_types')
        .select(
          'id, brand, model_family, model_code, variant, model_year'
        )
        .order('brand', { ascending: true });

      if (!typesError && typesData) {
        setAssetTypes(typesData as AssetType[]);
      }

      // Load related assets of same type for this user
      if (typedAsset.asset_type_id) {
        const { data: relatedData, error: relatedError } = await supabase
          .from('assets')
          .select(
            `
            id,
            title,
            status,
            brand,
            model_name,
            purchase_price,
            current_estimated_value,
            category:categories ( name )
          `
          )
          .eq('owner_id', user.id)
          .eq('asset_type_id', typedAsset.asset_type_id)
          .neq('id', assetId)
          .order('created_at', { ascending: false });

        if (!relatedError && relatedData) {
          setRelatedAssets(relatedData as Asset[]);
        }
      } else {
        setRelatedAssets([]);
      }

      // Load Magic Import ingestions for this asset
      const { data: ingestionData, error: ingestionError } = await supabase
        .from('ingestions')
        .select('id, status, created_at, finished_at')
        .eq('asset_id', assetId)
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });

      if (!ingestionError && ingestionData) {
        setIngestions(ingestionData as Ingestion[]);
      }

      setLoading(false);
    };

    if (assetId) {
      load();
    }
  }, [assetId, router]);

  const handleDelete = async () => {
    if (!asset) return;
    const confirmed = window.confirm(
      'Are you sure you want to delete this asset? This cannot be undone.'
    );
    if (!confirmed) return;

    setDeleting(true);
    const { error } = await supabase.from('assets').delete().eq('id', asset.id);
    setDeleting(false);

    if (error) {
      alert('Could not delete asset. Please try again.');
      return;
    }

    router.push('/dashboard');
  };

  const formatMoneyWithCurrency = (
    value: number | null,
    currency: string | null
  ) => {
    if (value == null) return '—';
    const cur = currency ?? 'GBP';
    if (cur === 'GBP') return `£${value.toFixed(0)}`;
    return `${cur} ${value.toFixed(0)}`;
  };

  const handleAddValuation = async (e: FormEvent) => {
    e.preventDefault();
    setValuationError(null);

    if (!asset || !userId) {
      setValuationError('Not ready to add a valuation yet.');
      return;
    }

    const numeric = parseFloat(newValue);
    if (Number.isNaN(numeric)) {
      setValuationError('Please enter a valid number for value.');
      return;
    }

    setSavingValuation(true);

    const { data, error } = await supabase
      .from('valuations')
      .insert([
        {
          asset_id: asset.id,
          requested_by: userId,
          suggested_value: numeric,
          currency: newCurrency || 'GBP',
          valuation_source: newSource || 'Manual – entered by you',
        },
      ])
      .select('id, suggested_value, currency, valuation_source, created_at')
      .single();

    setSavingValuation(false);

    if (error || !data) {
      setValuationError('Could not save valuation. Please try again.');
      return;
    }

    setValuations(prev => [data as Valuation, ...prev]);
    setNewValue('');
    setNewSource('Manual – entered by you');
  };

  const handleSnapshotFromCurrent = async () => {
    setValuationError(null);

    if (!asset || !userId) {
      setValuationError('Not ready to add a valuation yet.');
      return;
    }

    if (asset.current_estimated_value == null) {
      setValuationError(
        'No current estimated value to snapshot. Add one first.'
      );
      return;
    }

    setSavingValuation(true);

    const { data, error } = await supabase
      .from('valuations')
      .insert([
        {
          asset_id: asset.id,
          requested_by: userId,
          suggested_value: asset.current_estimated_value,
          currency: asset.estimate_currency || 'GBP',
          valuation_source: 'Snapshot from current estimate',
        },
      ])
      .select('id, suggested_value, currency, valuation_source, created_at')
      .single();

    setSavingValuation(false);

    if (error || !data) {
      setValuationError('Could not save snapshot. Please try again.');
      return;
    }

    setValuations(prev => [data as Valuation, ...prev]);
  };

  const handleSaveAssetType = async () => {
    setAssetTypeError(null);

    if (!asset) {
      setAssetTypeError('Asset not loaded yet.');
      return;
    }

    if (!selectedAssetTypeId) {
      setSavingAssetType(true);
      const { error } = await supabase
        .from('assets')
        .update({ asset_type_id: null })
        .eq('id', asset.id);

      setSavingAssetType(false);

      if (error) {
        setAssetTypeError('Could not clear catalog link. Please try again.');
        return;
      }

      setAsset({ ...asset, asset_type_id: null });
      setRelatedAssets([]);
      return;
    }

    setSavingAssetType(true);

    const { error } = await supabase
      .from('assets')
      .update({ asset_type_id: selectedAssetTypeId })
      .eq('id', asset.id);

    setSavingAssetType(false);

    if (error) {
      setAssetTypeError('Could not save catalog link. Please try again.');
      return;
    }

    setAsset({ ...asset, asset_type_id: selectedAssetTypeId });
  };

  const formatDelta = (value: number | null, currency: string | null) => {
    if (value == null) return '—';
    const base = Math.abs(value);
    const prefix = value > 0 ? '+' : value < 0 ? '−' : '';
    const cur = currency ?? 'GBP';
    const body =
      cur === 'GBP' ? `£${base.toFixed(0)}` : `${cur} ${base.toFixed(0)}`;
    return `${prefix}${body}`;
  };

  const handleRunMagicImport = async () => {
    setIngestionError(null);

    if (!asset || !userId) {
      setIngestionError('Not ready to create a Magic Import request yet.');
      return;
    }

    const identity = computeIdentity(asset);
    const hasContext =
      !!asset.purchase_url || !!asset.notes_internal || !!asset.receipt_url;

    const magicReady =
      (identity.level === 'good' || identity.level === 'strong') && hasContext;

    if (!magicReady) {
      setIngestionError(
        'This asset is not Magic-Ready yet. Add brand, model, category and a context source first.'
      );
      return;
    }

    setCreatingIngestion(true);

    const { data, error } = await supabase
      .from('ingestions')
      .insert([
        {
          asset_id: asset.id,
          owner_id: userId,
          status: 'pending',
        },
      ])
      .select('id, status, created_at, finished_at')
      .single();

    setCreatingIngestion(false);

    if (error || !data) {
      setIngestionError(
        'Could not create Magic Import request. Please try again.'
      );
      return;
    }

    setIngestions(prev => [data as Ingestion, ...prev]);
  };

  const handleProcessMagicImport = async () => {
    setIngestionError(null);

    if (!asset || !userId) {
      setIngestionError('Not ready to process Magic Import yet.');
      return;
    }

    const pendingJob = ingestions.find(j => j.status === 'pending');
    if (!pendingJob) {
      setIngestionError('No pending Magic Import requests for this asset.');
      return;
    }

    setProcessingMagic(true);

    try {
      const valuationSpec = computeRuleBasedValuation(asset);

      const { data: valuationData, error: valError } = await supabase
        .from('valuations')
        .insert([
          {
            asset_id: asset.id,
            requested_by: userId,
            suggested_value: Math.round(valuationSpec.value),
            currency: valuationSpec.currency,
            valuation_source: valuationSpec.source,
          },
        ])
        .select('id, suggested_value, currency, valuation_source, created_at')
        .single();

      if (valError || !valuationData) {
        setIngestionError(
          'Could not create valuation from Magic Import. Please try again.'
        );
        setProcessingMagic(false);
        return;
      }

      const { data: updatedJob, error: updError } = await supabase
        .from('ingestions')
        .update({
          status: 'complete',
          finished_at: new Date().toISOString(),
        })
        .eq('id', pendingJob.id)
        .select('id, status, created_at, finished_at')
        .single();

      if (updError || !updatedJob) {
        setIngestionError(
          'Valuation saved, but could not update Magic Import job status.'
        );
      }

      setValuations(prev => [valuationData as Valuation, ...prev]);

      if (updatedJob) {
        setIngestions(prev =>
          prev.map(j =>
            j.id === updatedJob.id ? (updatedJob as Ingestion) : j
          )
        );
      }
    } finally {
      setProcessingMagic(false);
    }
  };

  if (loading) {
    return <div className="p-6">Loading asset…</div>;
  }

  if (pageError || !asset) {
    return (
      <div className="p-6">
        <p className="mb-4 text-red-600">{pageError ?? 'Asset not found.'}</p>
        <button
          className="rounded border px-3 py-2 text-sm"
          onClick={() => router.push('/dashboard')}
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  const identity = computeIdentity(asset);

  const matchedType =
    asset.asset_type_id && assetTypes.length > 0
      ? assetTypes.find(t => t.id === asset.asset_type_id)
      : undefined;

  const matchedTypeLabel =
    matchedType &&
    [
      matchedType.brand,
      matchedType.model_family,
      matchedType.variant,
      matchedType.model_code,
      matchedType.model_year ? `(${matchedType.model_year})` : null,
    ]
      .filter(Boolean)
      .join(' · ');

  const showCatalogSection = true;

  const hasValuations = valuations.length > 0;
  const latestValuation = hasValuations ? valuations[0] : null;
  const firstValuation = hasValuations
    ? valuations[valuations.length - 1]
    : null;

  let minVal: number | null = null;
  let maxVal: number | null = null;

  if (hasValuations) {
    valuations.forEach(v => {
      if (v.suggested_value == null) return;
      if (minVal === null || v.suggested_value < minVal) {
        minVal = v.suggested_value;
      }
      if (maxVal === null || v.suggested_value > maxVal) {
        maxVal = v.suggested_value;
      }
    });
  }

  const diff = (a: number | null, b: number | null) =>
    a != null && b != null ? a - b : null;

  const changeSinceFirst =
    latestValuation && firstValuation
      ? diff(latestValuation.suggested_value, firstValuation.suggested_value)
      : null;

  const changeVsPurchase =
    latestValuation && asset.purchase_price != null
      ? diff(latestValuation.suggested_value, asset.purchase_price)
      : null;

  const changeVsCurrentEstimate =
    latestValuation && asset.current_estimated_value != null
      ? diff(latestValuation.suggested_value, asset.current_estimated_value)
      : null;

  const hasContext =
    !!asset.purchase_url || !!asset.notes_internal || !!asset.receipt_url;

  const magicReady =
    (identity.level === 'good' || identity.level === 'strong') && hasContext;

  const matchedTypeLabelExists = Boolean(matchedType && matchedTypeLabel);

  const hasIngestions = ingestions.length > 0;
  const hasPendingIngestion = ingestions.some(j => j.status === 'pending');

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{asset.title}</h1>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${identity.colorClass}`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {identity.label}
            </span>
          </div>
          <p className="text-sm text-slate-600">
            Category: {getCategoryName(asset)} · Status:{' '}
            {asset.status ?? 'unknown'}
          </p>
          <p className="mt-1 text-xs text-slate-500">{identity.description}</p>
          {matchedTypeLabelExists && (
            <p className="mt-1 text-xs text-emerald-700">
              Matched to:{' '}
              <span className="font-medium">{matchedTypeLabel}</span>
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            className="rounded border px-3 py-2 text-sm"
            onClick={() => router.push('/dashboard')}
          >
            Back
          </button>
          <button
            className="rounded border px-3 py-2 text-sm"
            onClick={() => router.push(`/assets/${asset.id}/edit`)}
          >
            Edit
          </button>
          <button
            className="rounded bg-red-600 px-3 py-2 text-sm text-white disabled:opacity-50"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>

      {/* Value summary */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded border p-4 text-sm">
          <p className="mb-1 font-medium">Purchase</p>
          <p>
            Value:{' '}
            <span className="font-semibold">
              {formatMoneyWithCurrency(
                asset.purchase_price,
                asset.purchase_currency
              )}
            </span>
          </p>
          {asset.purchase_date && (
            <p className="mt-1 text-xs text-slate-600">
              Purchased:{' '}
              {new Date(asset.purchase_date).toLocaleDateString()}
            </p>
          )}
        </div>
        <div className="rounded border p-4 text-sm">
          <p className="mb-1 font-medium">Current estimated value</p>
          <p>
            Value:{' '}
            <span className="font-semibold">
              {formatMoneyWithCurrency(
                asset.current_estimated_value,
                asset.estimate_currency
              )}
            </span>
          </p>
          {asset.current_condition && (
            <p className="mt-1 text-xs text-slate-600">
              Condition: {asset.current_condition}
            </p>
          )}
        </div>
      </div>

      {/* Magic Import readiness */}
      <div className="rounded border bg-white p-4 text-sm">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <p className="font-medium">Magic Import readiness</p>
            <p className="text-xs text-slate-600">
              Is Round ready to automatically recognise and value this asset?
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${
              magicReady
                ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                : 'bg-amber-50 text-amber-800 border-amber-200'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {magicReady ? 'Ready for Magic Import' : 'Not ready yet'}
          </span>
        </div>
        <ul className="mt-1 list-disc pl-4 text-xs text-slate-700">
          <li>
            Identity:{' '}
            <span className="font-medium">
              {identity.level === 'strong'
                ? 'Strong / Exact'
                : identity.level === 'good'
                ? 'Good'
                : identity.level === 'basic'
                ? 'Basic'
                : 'Unknown'}
            </span>
          </li>
          <li>
            Context sources:{' '}
            <span className="font-medium">
              {[
                asset.purchase_url && 'Product / purchase URL',
                asset.notes_internal && 'Email / notes',
                asset.receipt_url && 'Receipt PDF',
              ]
                .filter(Boolean)
                .join(', ') || 'None yet'}
            </span>
          </li>
        </ul>
        {!magicReady && (
          <p className="mt-2 text-xs text-slate-500">
            To get this asset ready, make sure it has brand, model and category
            set, and add at least one context source: a product URL, email
            text, or a receipt PDF.
          </p>
        )}

        <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleRunMagicImport}
              disabled={creatingIngestion || !asset || !userId}
              className="rounded bg-black px-4 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {creatingIngestion
                ? 'Creating Magic Import…'
                : 'Run Magic Import'}
            </button>
            <button
              type="button"
              onClick={handleProcessMagicImport}
              disabled={
                processingMagic || !asset || !userId || !hasPendingIngestion
              }
              className="rounded border px-4 py-2 text-xs font-medium text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {processingMagic
                ? 'Processing Magic Import…'
                : hasPendingIngestion
                ? 'Process Magic Import (demo)'
                : 'No pending jobs'}
            </button>
          </div>
          <p className="text-[11px] text-slate-500 md:text-right">
            In this MVP, Magic Import creates a request record and this demo
            processor uses simple value profiles (depreciating / neutral /
            appreciating), age and condition to generate a placeholder
            valuation. Later, this will be powered by real market data and AI.
          </p>
        </div>

        {ingestionError && (
          <p className="mt-2 text-xs text-red-600">{ingestionError}</p>
        )}

        {hasIngestions && (
          <div className="mt-3 border-t pt-3">
            <p className="mb-1 text-xs font-medium text-slate-700">
              Magic Import requests
            </p>
            <ul className="space-y-1 text-xs text-slate-700">
              {ingestions.map(job => (
                <li key={job.id} className="flex justify-between">
                  <span>
                    {new Date(job.created_at).toLocaleString()} –{' '}
                    <span className="capitalize">{job.status}</span>
                  </span>
                  {job.finished_at && (
                    <span className="text-[10px] text-slate-500">
                      Completed:{' '}
                      {new Date(job.finished_at).toLocaleString()}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Canonical identity (catalog) */}
      {showCatalogSection && (
        <div className="rounded border bg-slate-50 p-4 text-sm">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="font-medium">Canonical identity (catalog)</p>
              <p className="text-xs text-slate-600">
                Link this asset to a catalog identity. In future, this will be
                set automatically when Round recognises the exact product.
              </p>
            </div>
          </div>

          {assetTypes.length === 0 ? (
            <p className="text-xs text-slate-500">
              You don&apos;t have any catalog entries yet. Add rows to
              <span className="mx-1 font-mono">asset_types</span> in Supabase
              to start using this.
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-2 md:flex-row md:items-end">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-600">
                    Catalog identity
                  </label>
                  <select
                    value={selectedAssetTypeId}
                    onChange={e => setSelectedAssetTypeId(e.target.value)}
                    className="mt-1 w-full rounded border px-2 py-1 text-sm"
                  >
                    <option value="">No catalog link</option>
                    {assetTypes.map(t => {
                      const labelParts = [
                        t.brand,
                        t.model_family,
                        t.variant,
                        t.model_code,
                        t.model_year ? `(${t.model_year})` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ');

                      return (
                        <option key={t.id} value={t.id}>
                          {labelParts || t.id}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <button
                    onClick={handleSaveAssetType}
                    className="mt-4 rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50 md:mt-0"
                    disabled={savingAssetType}
                  >
                    {savingAssetType ? 'Saving…' : 'Save link'}
                  </button>
                </div>
              </div>
              {matchedTypeLabelExists && (
                <p className="mt-2 text-xs text-emerald-700">
                  Currently matched to:{' '}
                  <span className="font-medium">{matchedTypeLabel}</span>
                </p>
              )}
            </>
          )}

          {assetTypeError && (
            <p className="mt-2 text-xs text-red-600">{assetTypeError}</p>
          )}
        </div>
      )}

      {/* Other assets of this type */}
      {asset.asset_type_id && relatedAssets.length > 0 && (
        <div className="rounded border p-4 text-sm">
          <p className="mb-2 font-medium">
            Other assets of this type in your portfolio
          </p>
          <p className="mb-3 text-xs text-slate-600">
            These assets are linked to the same catalog identity. In future,
            Round can aggregate valuations and usage across all of them.
          </p>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b">
                <th className="py-1 text-left">Title</th>
                <th className="py-1 text-left">Category</th>
                <th className="py-1 text-left">Status</th>
                <th className="py-1 text-right">Purchase</th>
                <th className="py-1 text-right">Current</th>
              </tr>
            </thead>
            <tbody>
              {relatedAssets.map(a => (
                <tr
                  key={a.id}
                  className="cursor-pointer border-b hover:bg-slate-50"
                  onClick={() => router.push(`/assets/${a.id}`)}
                >
                  <td className="py-1">
                    <div className="flex flex-col">
                      <span>{a.title}</span>
                      {(a.brand || a.model_name) && (
                        <span className="text-[10px] text-slate-500">
                          {[a.brand, a.model_name].filter(Boolean).join(' ')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-1">{getCategoryName(a)}</td>
                  <td className="py-1 capitalize">
                    {a.status ?? 'unknown'}
                  </td>
                  <td className="py-1 text-right">
                    {formatMoneyWithCurrency(
                      a.purchase_price,
                      asset.purchase_currency
                    )}
                  </td>
                  <td className="py-1 text-right">
                    {formatMoneyWithCurrency(
                      a.current_estimated_value,
                      asset.estimate_currency
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Documents & context */}
      <div className="rounded border p-4 text-sm">
        <p className="mb-2 font-medium">Documents & context</p>
        <div className="flex flex-col gap-2 text-xs text-slate-700">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-4">
            <div>
              <span className="font-semibold">Purchase link: </span>
              {asset.purchase_url ? (
                <a
                  href={asset.purchase_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 underline"
                >
                  Open
                </a>
              ) : (
                <span>—</span>
              )}
            </div>
            <div>
              <span className="font-semibold">Receipt PDF: </span>
              {asset.receipt_url ? (
                <a
                  href={asset.receipt_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 underline"
                >
                  Open
                </a>
              ) : (
                <span>—</span>
              )}
            </div>
          </div>
          <div>
            <span className="font-semibold">Email / notes: </span>
            {asset.notes_internal ? (
              <span className="whitespace-pre-wrap">
                {asset.notes_internal.length > 200
                  ? asset.notes_internal.slice(0, 200) + '…'
                  : asset.notes_internal}
              </span>
            ) : (
              <span>—</span>
            )}
          </div>
        </div>
      </div>

      {/* Valuation history */}
      <div className="rounded border p-4 text-sm">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="font-medium">Valuation history</p>
            <p className="text-xs text-slate-600">
              Track how your estimate changes over time.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSnapshotFromCurrent}
            className="rounded border px-3 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            disabled={savingValuation}
          >
            {savingValuation ? 'Saving…' : 'Snapshot from current estimate'}
          </button>
        </div>

        <form
          onSubmit={handleAddValuation}
          className="mb-4 flex flex-col gap-2 md:flex-row md:items-end"
        >
          <div>
            <label className="block text-xs font-medium text-slate-600">
              Value
            </label>
            <input
              type="number"
              step="0.01"
              value={newValue}
              onChange={e => setNewValue(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1 text-sm"
              placeholder="e.g. 1200"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">
              Currency
            </label>
            <select
              value={newCurrency}
              onChange={e => setNewCurrency(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1 text-sm"
            >
              <option value="GBP">GBP (£)</option>
              <option value="EUR">EUR (€)</option>
              <option value="USD">USD ($)</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-600">
              Source
            </label>
            <input
              type="text"
              value={newSource}
              onChange={e => setNewSource(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1 text-sm"
              placeholder="Manual, Marketplace scan, Dealer quote…"
            />
          </div>
          <div>
            <button
              type="submit"
              className="mt-4 rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50 md:mt-0"
              disabled={savingValuation}
            >
              {savingValuation ? 'Saving…' : '+ Add valuation'}
            </button>
          </div>
        </form>

        {valuationError && (
          <p className="mb-2 text-xs text-red-600">{valuationError}</p>
        )}

        {valuations.length === 0 ? (
          <p className="text-xs text-slate-600">
            No valuations yet. Add your first estimate above.
          </p>
        ) : (
          <table className="mt-2 w-full border-collapse text-xs">
            <thead>
              <tr className="border-b">
                <th className="py-1 text-left">Date</th>
                <th className="py-1 text-left">Source</th>
                <th className="py-1 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {valuations.map(v => (
                <tr key={v.id} className="border-b">
                  <td className="py-1">
                    {new Date(v.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-1">{v.valuation_source ?? '—'}</td>
                  <td className="py-1 text-right">
                    {formatMoneyWithCurrency(v.suggested_value, v.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Valuation insights */}
      {hasValuations && (
        <div className="rounded border bg-slate-50 p-4 text-sm">
          <p className="mb-2 font-medium">Valuation insights</p>
          <p className="mb-3 text-xs text-slate-600">
            A quick view of how this asset&apos;s value is evolving based on
            your snapshots.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-xs text-slate-500">Latest recorded value</p>
              <p className="text-sm font-semibold">
                {formatMoneyWithCurrency(
                  latestValuation?.suggested_value ?? null,
                  latestValuation?.currency ?? asset.estimate_currency
                )}
              </p>
              {firstValuation && latestValuation && (
                <p className="mt-1 text-xs text-slate-600">
                  Change since first snapshot:{' '}
                  <span className="font-medium">
                    {formatDelta(
                      changeSinceFirst,
                      latestValuation.currency ?? asset.estimate_currency
                    )}
                  </span>
                </p>
              )}
            </div>
            <div>
              <p className="text-xs text-slate-500">
                Range across snapshots
              </p>
              <p className="text-sm font-semibold">
                {minVal != null && maxVal != null
                  ? `${formatMoneyWithCurrency(
                      minVal,
                      latestValuation?.currency ?? asset.estimate_currency
                    )} → ${formatMoneyWithCurrency(
                      maxVal,
                      latestValuation?.currency ?? asset.estimate_currency
                    )}`
                  : '—'}
              </p>
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-xs text-slate-500">
                Versus purchase price
              </p>
              <p className="text-sm font-semibold">
                {asset.purchase_price == null
                  ? '—'
                  : formatDelta(
                      changeVsPurchase,
                      latestValuation?.currency ?? asset.purchase_currency
                    )}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">
                Versus current estimate field
              </p>
              <p className="text-sm font-semibold">
                {asset.current_estimated_value == null
                  ? '—'
                  : formatDelta(
                      changeVsCurrentEstimate,
                      latestValuation?.currency ?? asset.estimate_currency
                    )}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
