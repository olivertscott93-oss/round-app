'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type Category = {
  id: string;
  name: string | null;
};

export default function NewAssetPage() {
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);

  const [title, setTitle] = useState('');
  const [brand, setBrand] = useState('');
  const [modelName, setModelName] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [purchasePrice, setPurchasePrice] = useState<string>('');
  const [purchaseUrl, setPurchaseUrl] = useState('');
  const [notesInternal, setNotesInternal] = useState('');
  const [currentEstimatedValue, setCurrentEstimatedValue] = useState<string>('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load categories on mount
  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      const { data, error } = await supabase
        .from('categories')
        .select('id, name')
        .order('name', { ascending: true });

      if (!error && data) {
        setCategories(data as Category[]);
      }

      setLoadingCategories(false);
    };

    load();
  }, [router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSaving(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setErrorMessage('You need to be logged in to add an asset.');
      setSaving(false);
      return;
    }

    try {
      const purchasePriceNumber = purchasePrice
        ? parseFloat(purchasePrice)
        : null;
      const currentEstimateNumber = currentEstimatedValue
        ? parseFloat(currentEstimatedValue)
        : null;

      // 1) Insert the asset
      const { data: inserted, error: insertError } = await supabase
        .from('assets')
        .insert({
          owner_id: user.id,
          category_id: categoryId || null,
          title,
          brand: brand || null,
          model_name: modelName || null,
          serial_number: serialNumber || null,
          purchase_price: purchasePriceNumber,
          purchase_currency: 'GBP',
          current_estimated_value: currentEstimateNumber,
          estimate_currency: 'GBP',
          purchase_url: purchaseUrl || null,
          notes_internal: notesInternal || null,
          status: 'owned',
        })
        .select()
        .single();

      if (insertError || !inserted) {
        console.error(insertError);
        throw new Error('Could not create asset.');
      }

      const assetId = inserted.id as string;

      // 2) If there is a receipt file, upload it to Supabase Storage
      if (receiptFile) {
        const fileExt = receiptFile.name.split('.').pop();
        const safeExt = fileExt ? fileExt.toLowerCase() : 'pdf';
        const filePath = `${user.id}/${assetId}/receipt-${Date.now()}.${safeExt}`;

        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(filePath, receiptFile, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) {
          console.error(uploadError);
          // Not fatal: asset is created, we just warn the user
          setErrorMessage(
            'Asset created, but the receipt could not be uploaded. You can try again from the asset page.'
          );
        } else {
          // Get a public URL and save it to the asset
          const { data: publicData } = supabase.storage
            .from('receipts')
            .getPublicUrl(filePath);

          const publicUrl = publicData?.publicUrl ?? null;

          if (publicUrl) {
            const { error: updateError } = await supabase
              .from('assets')
              .update({
                receipt_url: publicUrl,
              })
              .eq('id', assetId);

            if (updateError) {
              console.error(updateError);
              setErrorMessage(
                'Asset created and receipt uploaded, but could not link the receipt. You can add it manually later.'
              );
            }
          }
        }
      }

      // 3) Redirect to the new asset detail page
      router.push(`/assets/${assetId}`);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Something went wrong.');
      setSaving(false);
      return;
    }

    setSaving(false);
  };

  if (loadingCategories) {
    return <div className="p-6">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">Add a new asset</h1>
      <p className="mb-6 text-sm text-slate-600">
        Start with the basics: give the asset a clear name, pick a category,
        and add as much identity as you can (brand, model, serial). This helps
        Round recognise it later for Magic Import and live valuations.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Title */}
        <div className="space-y-1">
          <label className="block text-sm font-medium">
            Asset title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm"
            placeholder="e.g. 123 Example Street – Main Residence, Vitra Softshell Chair – Home Office"
          />
        </div>

        {/* Category */}
        <div className="space-y-1">
          <label className="block text-sm font-medium">Category</label>
          <select
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm bg-white"
          >
            <option value="">Select a category (optional)</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>
                {cat.name ?? 'Untitled category'}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500">
            Use categories like &ldquo;Home / Property&rdquo;, &ldquo;Car&rdquo;,
            &ldquo;Electronics&rdquo; etc. This helps Round group assets and
            understand likely value behaviour.
          </p>
        </div>

        {/* Identity: brand / model / serial */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1">
            <label className="block text-sm font-medium">Brand</label>
            <input
              type="text"
              value={brand}
              onChange={e => setBrand(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm"
              placeholder="e.g. Vitra, Apple, Audi"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium">Model</label>
            <input
              type="text"
              value={modelName}
              onChange={e => setModelName(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm"
              placeholder="e.g. Softshell Chair, MacBook Pro, Q4 e-tron"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium">Serial / ID</label>
            <input
              type="text"
              value={serialNumber}
              onChange={e => setSerialNumber(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm"
              placeholder="Optional unique identifier"
            />
          </div>
        </div>

        {/* Purchase & current value */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="block text-sm font-medium">
              Purchase price (GBP)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={purchasePrice}
              onChange={e => setPurchasePrice(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm"
              placeholder="e.g. 250000 or 950"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium">
              Current estimated value (GBP)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={currentEstimatedValue}
              onChange={e => setCurrentEstimatedValue(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm"
              placeholder="Optional – can be updated over time"
            />
          </div>
        </div>

        {/* Purchase URL & notes */}
        <div className="space-y-1">
          <label className="block text-sm font-medium">Purchase URL</label>
          <input
            type="url"
            value={purchaseUrl}
            onChange={e => setPurchaseUrl(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm"
            placeholder="Link to listing, spec page or order confirmation"
          />
          <p className="text-xs text-slate-500">
            This helps Round later when scanning for live valuations or
            replacements.
          </p>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium">Notes / context</label>
          <textarea
            value={notesInternal}
            onChange={e => setNotesInternal(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm"
            rows={3}
            placeholder="Paste any useful context, like email snippets or notes about condition, upgrades, warranty, etc."
          />
        </div>

        {/* Receipt upload */}
        <div className="space-y-1">
          <label className="block text-sm font-medium">
            Receipt or invoice (PDF)
          </label>
          <input
            type="file"
            accept="application/pdf"
            onChange={e => {
              const file = e.target.files?.[0] ?? null;
              setReceiptFile(file);
            }}
            className="block w-full text-sm"
          />
          <p className="text-xs text-slate-500">
            Optional for now – in the future, Round can scan this to extract
            purchase details automatically.
          </p>
        </div>

        {/* Error message */}
        {errorMessage && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {errorMessage}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            className="text-sm text-slate-500 underline"
            onClick={() => router.push('/dashboard')}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save asset'}
          </button>
        </div>
      </form>
    </div>
  );
}
