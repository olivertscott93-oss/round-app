'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type Category = {
  id: string;
  name: string;
};

export default function EditAssetPage() {
  const router = useRouter();
  const params = useParams();
  const assetId = params?.id as string | undefined;

  const [categories, setCategories] = useState<Category[]>([]);
  const [title, setTitle] = useState('');
  const [brand, setBrand] = useState('');
  const [modelName, setModelName] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [status, setStatus] = useState<'owned' | 'for_sale'>('owned');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [currentEstimatedValue, setCurrentEstimatedValue] = useState('');
  const [purchaseUrl, setPurchaseUrl] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [sourceNotes, setSourceNotes] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptFileName, setReceiptFileName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!assetId) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      // Load categories
      const { data: catData } = await supabase
        .from('categories')
        .select('id, name')
        .order('name', { ascending: true });

      if (catData) {
        setCategories(catData as Category[]);
      }

      // Load asset data
      const { data: asset, error } = await supabase
        .from('assets')
        .select(
          `
          id,
          title,
          brand,
          model_name,
          category_id,
          status,
          purchase_price,
          purchase_date,
          current_estimated_value,
          purchase_url,
          receipt_url,
          source_notes
        `
        )
        .eq('id', assetId)
        .eq('owner_id', user.id)
        .single();

      if (error || !asset) {
        setError(error?.message ?? 'Asset not found');
        setLoading(false);
        return;
      }

      setTitle(asset.title ?? '');
      setBrand(asset.brand ?? '');
      setModelName(asset.model_name ?? '');
      setCategoryId(asset.category_id ?? '');
      setStatus((asset.status as 'owned' | 'for_sale') ?? 'owned');
      setPurchasePrice(
        asset.purchase_price != null ? String(asset.purchase_price) : ''
      );
      setPurchaseDate(asset.purchase_date ?? '');
      setCurrentEstimatedValue(
        asset.current_estimated_value != null
          ? String(asset.current_estimated_value)
          : ''
      );
      setPurchaseUrl(asset.purchase_url ?? '');
      setReceiptUrl(asset.receipt_url ?? '');
      setSourceNotes(asset.source_notes ?? '');

      setLoading(false);
    };

    load();
  }, [assetId, router]);

  const handleReceiptFile = (file: File | null) => {
    if (!file) {
      setReceiptFile(null);
      setReceiptFileName('');
      return;
    }

    if (file.type !== 'application/pdf') {
      alert('Please upload a PDF file.');
      return;
    }

    setReceiptFile(file);
    setReceiptFileName(file.name);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetId) return;

    setError(null);
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError('You must be logged in.');
      setSaving(false);
      return;
    }

    // Start with existing receipt URL
    let finalReceiptUrl: string | null = receiptUrl || null;

    // If a new file is selected, upload and override
    if (receiptFile) {
      const filePath = `${user.id}/${Date.now()}-${receiptFile.name}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(filePath, receiptFile);

      if (uploadError) {
        setError('Could not upload receipt: ' + uploadError.message);
        setSaving(false);
        return;
      }

      const { data: publicData } = supabase.storage
        .from('receipts')
        .getPublicUrl(uploadData!.path);

      finalReceiptUrl = publicData.publicUrl;
    }

    const { error } = await supabase
      .from('assets')
      .update({
        title,
        brand,
        model_name: modelName,
        category_id: categoryId || null,
        status,
        purchase_price: purchasePrice ? Number(purchasePrice) : null,
        purchase_date: purchaseDate || null,
        current_estimated_value: currentEstimatedValue
          ? Number(currentEstimatedValue)
          : null,
        purchase_url: purchaseUrl || null,
        receipt_url: finalReceiptUrl,
        source_notes: sourceNotes || null,
      })
      .eq('id', assetId)
      .eq('owner_id', user.id);

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    router.push(`/assets/${assetId}`);
  };

  if (loading) {
    return <div className="p-6">Loading asset…</div>;
  }

  if (error) {
    return (
      <div className="p-6 space-y-4">
        <p>There was a problem loading this asset.</p>
        <p className="text-sm text-red-500">{error}</p>
        <button
          className="rounded border px-4 py-2"
          onClick={() => router.push('/dashboard')}
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      <button
        className="mb-4 text-sm text-blue-600 underline"
        onClick={() => router.push(`/assets/${assetId}`)}
      >
        &larr; Back to asset
      </button>

      <h1 className="mb-4 text-2xl font-semibold">Edit asset</h1>

      <form onSubmit={handleSubmit} className="max-w-xl space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Title</label>
          <input
            className="w-full rounded border px-3 py-2"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Brand</label>
          <input
            className="w-full rounded border px-3 py-2"
            value={brand}
            onChange={e => setBrand(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Model name</label>
          <input
            className="w-full rounded border px-3 py-2"
            value={modelName}
            onChange={e => setModelName(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Purchase URL (product page / listing)
          </label>
          <input
            className="w-full rounded border px-3 py-2"
            type="url"
            placeholder="https://…"
            value={purchaseUrl}
            onChange={e => setPurchaseUrl(e.target.value)}
          />
        </div>

        {/* Existing receipt + upload new PDF */}
        <div>
          <label className="mb-1 block text-sm font-medium">
            Receipt (PDF)
          </label>
          <div className="mb-2 text-xs text-slate-600">
            {receiptUrl ? (
              <span>
                Current receipt:{' '}
                <a
                  href={receiptUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 underline break-all"
                >
                  Open
                </a>
              </span>
            ) : (
              <span>No receipt uploaded yet.</span>
            )}
          </div>
          <div
            className="cursor-pointer rounded border border-dashed px-3 py-4 text-sm text-slate-600"
            onDragOver={e => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={e => {
              e.preventDefault();
              e.stopPropagation();
              const file = e.dataTransfer.files?.[0] ?? null;
              handleReceiptFile(file);
            }}
          >
            <input
              id="receipt-upload-edit"
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={e =>
                handleReceiptFile(e.target.files?.[0] ?? null)
              }
            />
            <label
              htmlFor="receipt-upload-edit"
              className="block cursor-pointer"
            >
              {receiptFileName
                ? `New file selected: ${receiptFileName}`
                : 'Click to upload or drag a PDF receipt here to replace the existing one'}
            </label>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Category</label>
          <select
            className="w-full rounded border px-3 py-2"
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
          >
            <option value="">Select category</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Status</label>
          <select
            className="w-full rounded border px-3 py-2"
            value={status}
            onChange={e => setStatus(e.target.value as any)}
          >
            <option value="owned">Owned</option>
            <option value="for_sale">For sale</option>
          </select>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium">
              Purchase price (£)
            </label>
            <input
              className="w-full rounded border px-3 py-2"
              type="number"
              step="0.01"
              min="0"
              value={purchasePrice}
              onChange={e => setPurchasePrice(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Purchase date
            </label>
            <input
              className="w-full rounded border px-3 py-2"
              type="date"
              value={purchaseDate}
              onChange={e => setPurchaseDate(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Current est. value (£)
            </label>
            <input
              className="w-full rounded border px-3 py-2"
              type="number"
              step="0.01"
              min="0"
              value={currentEstimatedValue}
              onChange={e => setCurrentEstimatedValue(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Source notes / email text
          </label>
          <textarea
            className="h-28 w-full rounded border px-3 py-2 text-sm"
            placeholder="Paste confirmation email text, order notes, etc."
            value={sourceNotes}
            onChange={e => setSourceNotes(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex gap-2">
          <button
            className="rounded bg-black px-4 py-2 text-white"
            type="submit"
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button
            type="button"
            className="rounded border px-4 py-2"
            onClick={() => router.push(`/assets/${assetId}`)}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}