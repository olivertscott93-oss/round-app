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

  const condition =
    (asset.current_condition || 'unknown').toLowerCase();

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
    value = value * Math.pow(1 - 0.10, laterYears);

    // Floor at 10% of original
    const floor = basePrice * 0.1;
    if (value < floor) value = floor;

    // Standard condition multiplier
    value = value * conditionMultiplier;

    profileLabel = 'depreciating asset (e.g. car / electronics)';

  } else {
    // NEUTRAL – mild decline over time
    const neutralRate = 0.10; // 10% per year
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

    const magicReady
