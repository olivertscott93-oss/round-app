'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

type Category = {
  id: string;
  name: string;
};

export default function NewAssetPage() {
  const router = useRouter();
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
  const [sourceNotes, setSourceNotes] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptFileName, setReceiptFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name')
        .order('name', { ascending: true });

      if (!error && data) {
        setCategories(data as Category[]);
      }
    })();
  }, []);

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

    // 1) Upload receipt if we have a file
    let receiptUrl: string | null = null;

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

      receiptUrl = publicData.publicUrl;
    }

    // 2) Insert the asset
    const { error } = await supabase.from('assets').insert({
      owner_id: user.id,
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
      receipt_url: receiptUrl,
      source_notes: sourceNotes || null,
    });

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    router.push('/dashboard');
  };

  return (
    <div className="p-6">
      <button
        className="mb-4 text-sm text-blue-600 underline"
        onClick={() => router.push('/dashboard')}
      >
        &larr; Back to dashboard
      </button>

      <div className="mb-6 space-y-1">
        <h1 className="text-2xl font-semibold">Magic import</h1>
        <p className="text-sm text-slate-600">
          Start with whatever you have – a link, a receipt or an email – and
          Round will keep it attached to this asset. Then just confirm the key
          details.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
        {/* STEP 1: SOURCES */}
        <div className="space-y-3 rounded border bg-slate-50 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
            Step 1 · Add your source
          </h2>
          <p className="text-xs text-slate-600">
            These are optional, but powerful. Links, receipts and emails make it
            easier to verify and re-value your assets later.
          </p>

          {/* Purchase URL */}
          <div>
            <label className="mb-1 block text-sm font-medium">
              Purchase URL
            </label>
            <input
              className="w-full rounded border px-3 py-2 text-sm"
              type="url"
              placeholder="Paste a product page, marketplace listing or advert (https://…)"
              value={purchaseUrl}
              onChange={e => setPurchaseUrl(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">
              In future, Round will be able to scan this page to suggest title,
              brand and pricing for you.
            </p>
          </div>

          {/* Receipt PDF upload */}
          <div>
            <label className="mb-1 block text-sm font-medium">
              Receipt (PDF)
            </label>
            <div
              className="cursor-pointer rounded border border-dashed bg-white px-3 py-4 text-sm text-slate-600"
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
                id="receipt-upload"
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={e =>
                  handleReceiptFile(e.target.files?.[0] ?? null)
                }
              />
              <label htmlFor="receipt-upload" className="block cursor-pointer">
                {receiptFileName
                  ? `Selected: ${receiptFileName}`
                  : 'Click to upload or drag a PDF receipt here'}
              </label>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              We store the PDF securely in your receipts bucket. In future,
              Round will be able to read the receipt and extract dates,
              merchant and totals automatically.
            </p>
          </div>

          {/* Source notes / email text */}
          <div>
            <label className="mb-1 block text-sm font-medium">
              Source notes / email text
            </label>
            <textarea
              className="h-28 w-full rounded border px-3 py-2 text-sm"
              placeholder="Paste order confirmation emails, warranty details or any notes you’d normally lose in your inbox."
              value={sourceNotes}
              onChange={e => setSourceNotes(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">
              In future, Round will be able to parse this text and help
              pre-fill the asset details for you.
            </p>
          </div>
        </div>

        {/* STEP 2: ASSET DETAILS */}
        <div className="space-y-4 rounded border bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
            Step 2 · Asset details
          </h2>
          <p className="text-xs text-slate-600">
            These are the fields that power your portfolio view and totals.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium">Title</label>
              <input
                className="w-full rounded border px-3 py-2 text-sm"
                value={title}
                onChange={e => setTitle(e.target.value)}
                required
                placeholder="e.g. Vitra ACX Mesh Task Chair"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Brand</label>
              <input
                className="w-full rounded border px-3 py-2 text-sm"
                value={brand}
                onChange={e => setBrand(e.target.value)}
                placeholder="e.g. Vitra"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                Model name
              </label>
              <input
                className="w-full rounded border px-3 py-2 text-sm"
                value={modelName}
                onChange={e => setModelName(e.target.value)}
                placeholder="e.g. ACX Mesh"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                Category
              </label>
              <select
                className="w-full rounded border px-3 py-2 text-sm"
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
                className="w-full rounded border px-3 py-2 text-sm"
                value={status}
                onChange={e => setStatus(e.target.value as any)}
              >
                <option value="owned">Owned</option>
                <option value="for_sale">For sale</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium">
                Purchase price (£)
              </label>
              <input
                className="w-full rounded border px-3 py-2 text-sm"
                type="number"
                step="0.01"
                min="0"
                value={purchasePrice}
                onChange={e => setPurchasePrice(e.target.value)}
                placeholder="e.g. 495"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                Purchase date
              </label>
              <input
                className="w-full rounded border px-3 py-2 text-sm"
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
                className="w-full rounded border px-3 py-2 text-sm"
                type="number"
                step="0.01"
                min="0"
                value={currentEstimatedValue}
                onChange={e => setCurrentEstimatedValue(e.target.value)}
                placeholder="e.g. 320"
              />
            </div>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-500">
            There was a problem saving this asset: {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            className="rounded bg-black px-4 py-2 text-sm font-medium text-white"
            type="submit"
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save asset'}
          </button>
          <button
            type="button"
            className="rounded border px-4 py-2 text-sm"
            onClick={() => router.push('/dashboard')}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}