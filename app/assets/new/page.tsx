'use client';

import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

type Category = {
  id: string;
  name: string | null;
};

export default function NewAssetPage() {
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);

  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [brand, setBrand] = useState('');
  const [modelName, setModelName] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [currentEstimatedValue, setCurrentEstimatedValue] = useState('');
  const [purchaseUrl, setPurchaseUrl] = useState('');
  const [emailNotes, setEmailNotes] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadCategories = async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name')
        .order('name', { ascending: true });

      if (!error && data) {
        setCategories(data as Category[]);
      }

      setLoadingCategories(false);
    };

    loadCategories();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (file && file.type !== 'application/pdf') {
      alert('Please upload a PDF receipt.');
      e.target.value = '';
      return;
    }
    setReceiptFile(file);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setErrorMessage('You must be logged in to add an asset.');
      return;
    }

    if (!title.trim()) {
      setErrorMessage('Please give your asset a title.');
      return;
    }

    const selectedCategory = categories.find(c => c.id === categoryId);
    const categoryName = selectedCategory?.name?.toLowerCase() ?? '';

    const isCar = categoryName.includes('car');
    const isElectronics =
      categoryName.includes('electronics') ||
      categoryName.includes('phone') ||
      categoryName.includes('laptop') ||
      categoryName.includes('computer');
    const isFurniture =
      categoryName.includes('chair') ||
      categoryName.includes('sofa') ||
      categoryName.includes('desk') ||
      categoryName.includes('furniture');

    if ((isCar || isElectronics || isFurniture) && (!brand.trim() || !modelName.trim())) {
      setErrorMessage(
        'For cars, electronics and key furniture, please include brand and model so Round can really know what this asset is.'
      );
      return;
    }

    setSaving(true);

    const purchasePriceNum = purchasePrice ? parseFloat(purchasePrice) : null;
    const currentValueNum = currentEstimatedValue
      ? parseFloat(currentEstimatedValue)
      : null;

    const { data: inserted, error: insertError } = await supabase
      .from('assets')
      .insert([
        {
          owner_id: user.id,
          category_id: categoryId || null,
          title: title.trim(),
          brand: brand.trim() || null,
          model_name: modelName.trim() || null,
          serial_number: serialNumber.trim() || null,
          purchase_price: purchasePriceNum,
          purchase_currency: 'GBP',
          current_estimated_value: currentValueNum,
          estimate_currency: 'GBP',
          purchase_url: purchaseUrl.trim() || null,
          notes_internal: emailNotes.trim() || null,
          status: 'owned',
        },
      ])
      .select('id')
      .single();

    if (insertError || !inserted) {
      setSaving(false);
      setErrorMessage('Could not save asset. Please try again.');
      return;
    }

    const assetId = inserted.id as string;

    if (receiptFile) {
      const filePath = `${user.id}/${assetId}-${Date.now()}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(filePath, receiptFile);

      if (!uploadError) {
        const { data: publicUrlData } = supabase.storage
          .from('receipts')
          .getPublicUrl(filePath);

        const receiptUrl = publicUrlData?.publicUrl ?? null;

        if (receiptUrl) {
          await supabase
            .from('assets')
            .update({ receipt_url: receiptUrl })
            .eq('id', assetId);
        }
      }
    }

    setSaving(false);
    router.push('/dashboard');
  };

  const currentCategoryName =
    categories.find(c => c.id === categoryId)?.name ?? '';

  const hints: string[] = [];

  if (currentCategoryName) {
    const lower = currentCategoryName.toLowerCase();
    if (lower.includes('car')) {
      hints.push(
        'Include the exact model and year so Round can match valuation data accurately.'
      );
      hints.push(
        'Adding the registration or VIN will allow much stronger identity later.'
      );
    } else if (
      lower.includes('electronics') ||
      lower.includes('phone') ||
      lower.includes('laptop') ||
      lower.includes('computer')
    ) {
      hints.push(
        'Include brand and model code (e.g. “iPhone 15 Pro Max, 256GB”) to match to the catalog.'
      );
    } else if (
      lower.includes('chair') ||
      lower.includes('sofa') ||
      lower.includes('desk') ||
      lower.includes('furniture')
    ) {
      hints.push(
        'Include the exact product name (e.g. “Vitra ID Mesh”) so Round can recognise it as a design classic.'
      );
    }
  }

  return (
    <div className="p-6">
      <h1 className="mb-4 text-2xl font-semibold">Add a new asset</h1>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
        {/* Basic identity */}
        <div className="rounded border p-4 text-sm">
          <p className="mb-2 font-medium">Basic details</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-600">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                placeholder="e.g. BMW 3 Series Touring, Vitra ID Mesh chair, MacBook Pro 14”"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600">
                Category
              </label>
              <select
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
                className="mt-1 w-full rounded border px-2 py-1 text-sm"
              >
                <option value="">Select category</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {loadingCategories && (
                <p className="mt-1 text-[10px] text-slate-500">
                  Loading categories…
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600">
                Brand
              </label>
              <input
                type="text"
                value={brand}
                onChange={e => setBrand(e.target.value)}
                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                placeholder="e.g. BMW, Vitra, Apple"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600">
                Model / Product name
              </label>
              <input
                type="text"
                value={modelName}
                onChange={e => setModelName(e.target.value)}
                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                placeholder="e.g. 320d Touring, ID Mesh, MacBook Pro 14”"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600">
                Serial / Registration (optional)
              </label>
              <input
                type="text"
                value={serialNumber}
                onChange={e => setSerialNumber(e.target.value)}
                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                placeholder="VIN, serial number, reg plate…"
              />
            </div>
          </div>

          {hints.length > 0 && (
            <div className="mt-3 rounded bg-slate-50 p-2 text-xs text-slate-700">
              <p className="mb-1 font-medium">To help Round know this asset:</p>
              <ul className="list-disc pl-4">
                {hints.map((hint, idx) => (
                  <li key={idx}>{hint}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Value */}
        <div className="rounded border p-4 text-sm">
          <p className="mb-2 font-medium">Value</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-600">
                Purchase price (GBP)
              </label>
              <input
                type="number"
                step="0.01"
                value={purchasePrice}
                onChange={e => setPurchasePrice(e.target.value)}
                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                placeholder="e.g. 1500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">
                Current estimated value (GBP)
              </label>
              <input
                type="number"
                step="0.01"
                value={currentEstimatedValue}
                onChange={e => setCurrentEstimatedValue(e.target.value)}
                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                placeholder="e.g. 900"
              />
            </div>
          </div>
        </div>

        {/* Context for Magic Import */}
        <div className="rounded border p-4 text-sm bg-slate-50">
          <p className="mb-1 font-medium">Context for Magic Import</p>
          <p className="mb-3 text-xs text-slate-600">
            Round will eventually use this to automatically recognise the asset
            and pull in valuation data. For now, we simply store it so the AI
            layer has rich context to work with.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600">
                Product / purchase URL
              </label>
              <input
                type="url"
                value={purchaseUrl}
                onChange={e => setPurchaseUrl(e.target.value)}
                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                placeholder="Paste a product page or purchase link"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600">
                Email text / notes
              </label>
              <textarea
                value={emailNotes}
                onChange={e => setEmailNotes(e.target.value)}
                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                rows={4}
                placeholder="Paste an email confirmation, invoice text or any notes that describe this asset."
              />
              <p className="mt-1 text-[10px] text-slate-500">
                Later, Magic Import can read this and map it to a catalog
                identity and valuation.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600">
                Receipt PDF (optional)
              </label>
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                className="mt-1 block w-full text-xs text-slate-700"
              />
              <p className="mt-1 text-[10px] text-slate-500">
                Drag and drop or choose a PDF receipt. Round will store this in
                your secure receipts bucket.
              </p>
            </div>
          </div>
        </div>

        {errorMessage && (
          <p className="text-xs text-red-600">{errorMessage}</p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save asset'}
          </button>
          <button
            type="button"
            className="rounded border px-3 py-2 text-sm"
            onClick={() => router.push('/dashboard')}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
