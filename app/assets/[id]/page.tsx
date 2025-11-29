'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type Asset = {
  id: string;
  title: string;
  status: string | null;
  purchase_price: number | null;
  current_estimated_value: number | null;
  purchase_currency: string | null;
  estimate_currency: string | null;
  purchase_url: string | null;
  receipt_url: string | null;
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

export default function AssetDetailPage() {
  const router = useRouter();
  const params = useParams() as { id: string };
  const assetId = params.id;

  const [asset, setAsset] = useState<Asset | null>(null);
  const [valuations, setValuations] = useState<Valuation[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  // New valuation form state
  const [newValue, setNewValue] = useState('');
  const [newCurrency, setNewCurrency] = useState('GBP');
  const [newSource, setNewSource] = useState('Manual');
  const [savingValuation, setSavingValuation] = useState(false);
  const [valuationError, setValuationError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState(false);

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
          purchase_price,
          current_estimated_value,
          purchase_currency,
          estimate_currency,
          purchase_url,
          receipt_url,
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

      setAsset(assetData as Asset);

      // Load valuations
      const { data: valuationData, error: valuationError } = await supabase
        .from('valuations')
        .select('id, suggested_value, currency, valuation_source, created_at')
        .eq('asset_id', assetId)
        .order('created_at', { ascending: false });

      if (!valuationError && valuationData) {
        setValuations(valuationData as Valuation[]);
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

  const getCategoryName = (asset: Asset | null) => {
    if (!asset || !asset.category || asset.category.length === 0) return '—';
    return asset.category[0]?.name ?? '—';
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
          valuation_source: newSource || 'Manual',
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
    setNewSource('Manual');
    // keep currency as-is
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

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{asset.title}</h1>
          <p className="text-sm text-slate-600">
            Category: {getCategoryName(asset)} · Status:{' '}
            {asset.status ?? 'unknown'}
          </p>
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
