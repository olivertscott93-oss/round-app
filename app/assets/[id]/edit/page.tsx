'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
  city: string | null;
  country: string | null;
};

export default function EditAssetPage() {
  const params = useParams();
  const router = useRouter();
  const assetId = params?.id as string;

  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [brand, setBrand] = useState('');
  const [modelName, setModelName] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [status, setStatus] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [purchaseCurrency, setPurchaseCurrency] = useState('GBP');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [currentEstimatedValue, setCurrentEstimatedValue] = useState('');
  const [estimateCurrency, setEstimateCurrency] = useState('GBP');
  const [purchaseUrl, setPurchaseUrl] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [notesInternal, setNotesInternal] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');

  useEffect(() => {
    if (!assetId) return;

    const load = async () => {
      setLoading(true);
      setError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      const { data, error } = await supabase
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
          city,
          country
        `
        )
        .eq('id', assetId)
        .eq('owner_id', user.id)
        .single();

      if (error || !data) {
        console.error(error);
        setError('Could not load asset.');
        setLoading(false);
        return;
      }

      const a = data as Asset;
      setAsset(a);

      // hydrate form
      setTitle(a.title ?? '');
      setBrand(a.brand ?? '');
      setModelName(a.model_name ?? '');
      setSerialNumber(a.serial_number ?? '');
      setStatus(a.status ?? '');
      setPurchasePrice(
        a.purchase_price != null ? String(a.purchase_price) : ''
      );
      setPurchaseCurrency(a.purchase_currency ?? 'GBP');
      setPurchaseDate(a.purchase_date ?? '');
      setCurrentEstimatedValue(
        a.current_estimated_value != null
          ? String(a.current_estimated_value)
          : ''
      );
      setEstimateCurrency(a.estimate_currency ?? 'GBP');
      setPurchaseUrl(a.purchase_url ?? '');
      setReceiptUrl(a.receipt_url ?? '');
      setNotesInternal(a.notes_internal ?? '');
      setCity(a.city ?? '');
      setCountry(a.country ?? '');

      setLoading(false);
    };

    load();
  }, [assetId, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!assetId) return;

    setSaving(true);
    setError(null);

    try {
      const purchasePriceNumber = purchasePrice
        ? parseFloat(purchasePrice)
        : null;
      const currentEstimateNumber = currentEstimatedValue
        ? parseFloat(currentEstimatedValue)
        : null;

      const { error } = await supabase
        .from('assets')
        .update({
          title: title || null,
          brand: brand || null,
          model_name: modelName || null,
          serial_number: serialNumber || null,
          status: status || null,
          purchase_price: purchasePriceNumber,
          purchase_currency: purchaseCurrency || null,
          purchase_date: purchaseDate || null,
          current_estimated_value: currentEstimateNumber,
          estimate_currency: estimateCurrency || null,
          purchase_url: purchaseUrl || null,
          receipt_url: receiptUrl || null,
          notes_internal: notesInternal || null,
          city: city || null,
          country: country || null,
        } as any)
        .eq('id', assetId);

      if (error) {
        console.error(error);
        setError('Could not save changes.');
        setSaving(false);
        return;
      }

      router.push(`/assets/${assetId}`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Something went wrong.');
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!assetId) return;

    const confirmed = window.confirm(
      'Are you sure you want to delete this asset? This cannot be undone.'
    );
    if (!confirmed) return;

    setDeleting(true);
    setError(null);

    try {
      const { error } = await supabase
        .from('assets')
        .delete()
        .eq('id', assetId);

      if (error) {
        console.error(error);
        setError('Could not delete asset.');
        setDeleting(false);
        return;
      }

      // After delete, go back to dashboard
      router.push('/dashboard');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Something went wrong while deleting.');
      setDeleting(false);
    }
  };

  const handleCancel = () => {
    if (assetId) {
      router.push(`/assets/${assetId}`);
    } else {
      router.push('/dashboard');
    }
  };

  if (loading) {
    return <div className="p-6">Loading asset…</div>;
  }

  if (!asset) {
    return (
      <div className="p-6">
        <p className="mb-2 text-sm text-red-600">
          Could not find this asset.
        </p>
        <button
          className="rounded border px-3 py-1.5 text-sm"
          onClick={() => router.push('/dashboard')}
        >
          Back to portfolio
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <button
          className="text-sm text-slate-600 hover:text-slate-900"
          onClick={handleCancel}
        >
          ← Back
        </button>
        <h1 className="text-xl font-semibold">Edit asset</h1>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Edit form */}
      <form onSubmit={handleSubmit} className="space-y-4 text-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Title
            </label>
            <input
              className="w-full rounded border px-2 py-1.5 text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 73 Culver Road – Home"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Status
            </label>
            <select
              className="w-full rounded border px-2 py-1.5 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">—</option>
              <option value="owned">Owned</option>
              <option value="for_sale">For sale</option>
              <option value="sold">Sold</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Brand
            </label>
            <input
              className="w-full rounded border px-2 py-1.5 text-sm"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="e.g. Vitra, Apple"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Model name
            </label>
            <input
              className="w-full rounded border px-2 py-1.5 text-sm"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="e.g. Eames Lounge Chair, MacBook Pro"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Serial / unique ID
            </label>
            <input
              className="w-full rounded border px-2 py-1.5 text-sm"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-[2fr,1fr] gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Purchase price
              </label>
              <input
                className="w-full rounded border px-2 py-1.5 text-sm"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                placeholder="e.g. 350000"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Currency
              </label>
              <input
                className="w-full rounded border px-2 py-1.5 text-sm"
                value={purchaseCurrency}
                onChange={(e) => setPurchaseCurrency(e.target.value)}
                placeholder="GBP"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Purchase date
            </label>
            <input
              type="date"
              className="w-full rounded border px-2 py-1.5 text-sm"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-[2fr,1fr] gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Current estimated value
              </label>
              <input
                className="w-full rounded border px-2 py-1.5 text-sm"
                value={currentEstimatedValue}
                onChange={(e) => setCurrentEstimatedValue(e.target.value)}
                placeholder="e.g. 425000"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Currency
              </label>
              <input
                className="w-full rounded border px-2 py-1.5 text-sm"
                value={estimateCurrency}
                onChange={(e) => setEstimateCurrency(e.target.value)}
                placeholder="GBP"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              City
            </label>
            <input
              className="w-full rounded border px-2 py-1.5 text-sm"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. London"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Country
            </label>
            <input
              className="w-full rounded border px-2 py-1.5 text-sm"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="e.g. United Kingdom"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Purchase URL
            </label>
            <input
              className="w-full rounded border px-2 py-1.5 text-sm"
              value={purchaseUrl}
              onChange={(e) => setPurchaseUrl(e.target.value)}
              placeholder="Link to the purchase or listing (optional)"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Receipt URL (if stored elsewhere)
            </label>
            <input
              className="w-full rounded border px-2 py-1.5 text-sm"
              value={receiptUrl}
              onChange={(e) => setReceiptUrl(e.target.value)}
              placeholder="If the receipt is hosted online"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">
            Notes / context for Round
          </label>
          <textarea
            className="w-full rounded border px-2 py-1.5 text-sm"
            rows={4}
            value={notesInternal}
            onChange={(e) => setNotesInternal(e.target.value)}
            placeholder="Paste useful context here – email text, order confirmation, anything that helps Round understand the asset."
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-black px-4 py-2 text-sm text-white disabled:bg-slate-400"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="rounded border px-4 py-2 text-sm"
          >
            Cancel
          </button>
        </div>
      </form>

      {/* Delete section */}
      <div className="mt-6 rounded border border-red-200 bg-red-50 p-4 text-sm">
        <p className="mb-2 font-semibold text-red-800">Delete asset</p>
        <p className="mb-3 text-xs text-red-700">
          This will permanently remove this asset and its history from your
          Round account. This action cannot be undone.
        </p>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:bg-red-300"
        >
          {deleting ? 'Deleting…' : 'Delete asset'}
        </button>
      </div>
    </div>
  );
}
