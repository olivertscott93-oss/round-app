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
  current_estimated_value: number | null;
  purchase_currency: string | null;
  estimate_currency: string | null;
  purchase_url: string | null;
  receipt_url: string | null;
  asset_type_id: string | null;
  // Supabase returns category:categories ( name ) as an array of rows
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

  // If this asset is linked to a catalog entry, treat it as strongest identity
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

  const hasCategory = !!getCategoryName(asset) && getCategoryName(asset) !== '—';
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

export default function AssetDetailPage() {
  const router = useRouter();
  const params = useParams() as { id: string };
  const assetId = params.id;

  const [asset, setAsset] = useState<Asset | null>(null);
  const [valuations, setValuations] = useState<Valuation[]>([]);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [selectedAssetTypeId, setSelectedAssetTypeId] = useState<string | ''>('');
  const [userId, setUserId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  // New valuation form state
  const [newValue, setNewValue] = useState('');
  const [newCurrency, setNewCurrency] = useState('GBP');
  const [newSource, setNewSource] = useState('Manual – entered by you');
  const [savingValuation, setSavingValuation] = useState(false);
  const [valuationError, setValuationError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState(false);

  // Catalog link state
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
          current_estimated_value,
          purchase_currency,
          estimate_currency,
          purchase_url,
          receipt_url,
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

      // Load catalog asset types (for now: all of them)
      const { data: typesData, error: typesError } = await supabase
        .from('asset_types')
        .select(
          'id, brand, model_family, model_code, variant, model_year'
        )
        .order('brand', { ascending: true });

      if (!typesError && typesData) {
        setAssetTypes(typesData as AssetType[]);
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
    // keep currency as-is
  };

  const handleSaveAssetType = async () => {
    setAssetTypeError(null);

    if (!asset) {
      setAssetTypeError('Asset not loaded yet.');
      return;
    }

    if (!selectedAssetTypeId) {
      // Allow clearing the link
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

  // For now, show catalog selector to everyone; later this can be gated by email/flag if you want.
  const showCatalogSection = true;

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
        </div>
      </div>

      {/* Canonical identity (catalog) – dev/admin-style controls */}
      {showCatalogSection && (
        <div className="rounded border p-4 text-sm bg-slate-50">
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
              <span className="font-mono mx-1">asset_types</span> in Supabase
              to start using this.
            </p>
          ) : (
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
          )}

          {assetTypeError && (
            <p className="mt-2 text-xs text-red-600">{assetTypeError}</p>
          )}
        </div>
      )}

      {/* Links / docs */}
      <div className="rounded border p-4 text-sm">
        <p className="mb-2 font-medium">Documents</p>
        <div className="flex flex-col gap-1 md:flex-row md:gap-4">
          <div>
            <span className="font-semibold">Purchase link: </span>
            {asset.purchase_url ? (
              <a
                href={asset.purchase_url}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 underline"
                onClick={e => e.stopPropagation()}
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
                onClick={e => e.stopPropagation()}
              >
                Open
              </a>
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
        </div>

        {/* Add valuation form */}
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

        {/* Valuation list */}
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
    </div>
  );
}
