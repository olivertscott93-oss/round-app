'use client';

import { useEffect, useState, ChangeEvent, DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type Category = {
  id: string;
  name: string | null;
};

function isHomeCategoryName(name: string | null | undefined): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  const keywords = [
    'home',
    'house',
    'property',
    'flat',
    'apartment',
    'real estate',
  ];
  return keywords.some((k) => lower.includes(k));
}

export default function NewAssetPage() {
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] =
    useState(true);

  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');

  const [brand, setBrand] = useState('');
  const [modelName, setModelName] = useState('');
  const [serialNumber, setSerialNumber] = useState('');

  const [purchasePrice, setPurchasePrice] = useState('');
  const [purchaseCurrency, setPurchaseCurrency] =
    useState('GBP');
  const [purchaseDate, setPurchaseDate] = useState('');

  const [
    currentEstimatedValue,
    setCurrentEstimatedValue,
  ] = useState('');
  const [estimateCurrency, setEstimateCurrency] =
    useState('GBP');

  const [purchaseUrl, setPurchaseUrl] = useState('');
  const [notesInternal, setNotesInternal] =
    useState('');

  const [receiptFile, setReceiptFile] =
    useState<File | null>(null);

  const [submitting, setSubmitting] =
    useState(false);
  const [error, setError] = useState<string | null>(
    null
  );

  useEffect(() => {
    const loadCategories = async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name')
        .order('name');

      if (!error && data) {
        setCategories(data as Category[]);
      }
      setLoadingCategories(false);
    };

    loadCategories();
  }, []);

  const selectedCategory = categories.find(
    (c) => c.id === categoryId
  );
  const isHome = isHomeCategoryName(
    selectedCategory?.name
  );

  const handleReceiptChange = (
    e: ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      setReceiptFile(file);
    }
  };

  const handleReceiptDrop = (
    e: DragEvent<HTMLDivElement>
  ) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setReceiptFile(file);
    }
  };

  const handleReceiptDragOver = (
    e: DragEvent<HTMLDivElement>
  ) => {
    e.preventDefault();
  };

  const handleSubmit = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      let receiptUrl: string | null = null;

      if (receiptFile) {
        const bucket = 'receipts';
        const safeName = receiptFile.name.replace(
          /[^\w.\-]+/g,
          '_'
        );
        const path = `${user.id}/${Date.now()}-${safeName}`;

        const { error: uploadError } =
          await supabase.storage
            .from(bucket)
            .upload(path, receiptFile);

        if (uploadError) {
          console.error(uploadError);
          setError('Could not upload receipt.');
          setSubmitting(false);
          return;
        }

        const { data: publicUrlData } =
          supabase.storage
            .from(bucket)
            .getPublicUrl(path);

        receiptUrl =
          publicUrlData?.publicUrl ?? null;
      }

      const purchasePriceNumber =
        purchasePrice.trim() === ''
          ? null
          : Number(purchasePrice);
      const currentEstimatedNumber =
        currentEstimatedValue.trim() === ''
          ? null
          : Number(currentEstimatedValue);

      const { data, error: insertError } =
        await supabase
          .from('assets')
          .insert({
            owner_id: user.id,
            category_id:
              categoryId || null,
            title: title || null,
            // For homes, we ignore brand/model/serial
            brand: isHome
              ? null
              : brand || null,
            model_name: isHome
              ? null
              : modelName || null,
            serial_number: isHome
              ? null
              : serialNumber || null,
            city: city || null,
            country: country || null,
            purchase_price:
              purchasePriceNumber,
            purchase_currency:
              purchaseCurrency || 'GBP',
            purchase_date:
              purchaseDate || null,
            current_estimated_value:
              currentEstimatedNumber,
            estimate_currency:
              estimateCurrency ||
              purchaseCurrency ||
              'GBP',
            purchase_url:
              purchaseUrl || null,
            notes_internal:
              notesInternal || null,
            receipt_url: receiptUrl,
          })
          .select('id')
          .single();

      if (insertError || !data) {
        console.error(insertError);
        setError('Could not save asset.');
        setSubmitting(false);
        return;
      }

      router.push(`/assets/${data.id}`);
    } catch (err) {
      console.error(err);
      setError(
        'Something went wrong while saving this asset.'
      );
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push('/dashboard');
  };

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          Add new asset
        </h1>
        <button
          className="text-sm text-slate-600 hover:text-slate-900"
          onClick={handleCancel}
        >
          Cancel
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded border bg-white p-4 text-sm"
      >
        {/* Identity section */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-700">
              {isHome
                ? 'Address / Property name'
                : 'Asset name / title'}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) =>
                setTitle(e.target.value)
              }
              required
              placeholder={
                isHome
                  ? 'e.g. 73 Culver Road, AL1 4XX'
                  : 'e.g. Eames Lounge Chair, MacBook Pro…'
              }
              className="w-full rounded border px-2 py-1.5 text-sm"
            />

            <label className="mt-3 block text-xs font-medium text-slate-700">
              Category
            </label>
            <select
              value={categoryId}
              onChange={(e) =>
                setCategoryId(e.target.value)
              }
              required
              className="w-full rounded border px-2 py-1.5 text-sm"
            >
              <option value="">
                {loadingCategories
                  ? 'Loading categories…'
                  : 'Select category'}
              </option>
              {categories.map((cat) => (
                <option
                  key={cat.id}
                  value={cat.id}
                >
                  {cat.name || 'Unnamed'}
                </option>
              ))}
            </select>

            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  City
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) =>
                    setCity(e.target.value)
                  }
                  className="w-full rounded border px-2 py-1.5 text-sm"
                  placeholder={
                    isHome ? 'St Albans' : ''
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Country
                </label>
                <input
                  type="text"
                  value={country}
                  onChange={(e) =>
                    setCountry(e.target.value)
                  }
                  className="w-full rounded border px-2 py-1.5 text-sm"
                  placeholder={
                    isHome ? 'United Kingdom' : ''
                  }
                />
              </div>
            </div>
          </div>

          {/* Brand / Model block – hidden for homes */}
          {!isHome && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-700">
                Brand & model
              </p>
              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <label className="block text-[11px] text-slate-600">
                    Brand
                  </label>
                  <input
                    type="text"
                    value={brand}
                    onChange={(e) =>
                      setBrand(e.target.value)
                    }
                    className="w-full rounded border px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600">
                    Model
                  </label>
                  <input
                    type="text"
                    value={modelName}
                    onChange={(e) =>
                      setModelName(e.target.value)
                    }
                    className="w-full rounded border px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-slate-600">
                  Serial / unique ID
                </label>
                <input
                  type="text"
                  value={serialNumber}
                  onChange={(e) =>
                    setSerialNumber(
                      e.target.value
                    )
                  }
                  className="w-full rounded border px-2 py-1.5 text-sm"
                />
              </div>
            </div>
          )}
        </div>

        {/* Value section */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-700">
              Purchase details
            </p>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-[11px] text-slate-600">
                  Purchase price
                </label>
                <input
                  type="number"
                  value={purchasePrice}
                  onChange={(e) =>
                    setPurchasePrice(
                      e.target.value
                    )
                  }
                  className="w-full rounded border px-2 py-1.5 text-sm"
                />
              </div>
              <div className="w-28">
                <label className="block text-[11px] text-slate-600">
                  Currency
                </label>
                <input
                  type="text"
                  value={purchaseCurrency}
                  onChange={(e) =>
                    setPurchaseCurrency(
                      e.target.value
                    )
                  }
                  className="w-full rounded border px-2 py-1.5 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-slate-600">
                Purchase date
              </label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) =>
                  setPurchaseDate(
                    e.target.value
                  )
                }
                className="w-full rounded border px-2 py-1.5 text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-700">
              Current estimate
            </p>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-[11px] text-slate-600">
                  Estimated value today
                </label>
                <input
                  type="number"
                  value={currentEstimatedValue}
                  onChange={(e) =>
                    setCurrentEstimatedValue(
                      e.target.value
                    )
                  }
                  className="w-full rounded border px-2 py-1.5 text-sm"
                />
              </div>
              <div className="w-28">
                <label className="block text-[11px] text-slate-600">
                  Currency
                </label>
                <input
                  type="text"
                  value={estimateCurrency}
                  onChange={(e) =>
                    setEstimateCurrency(
                      e.target.value
                    )
                  }
                  className="w-full rounded border px-2 py-1.5 text-sm"
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              For now, this is manual – later, Round will
              keep this refreshed using live market data.
            </p>
          </div>
        </div>

        {/* Context section */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-700">
              Purchase link & notes
            </p>
            <div>
              <label className="block text-[11px] text-slate-600">
                {isHome
                  ? 'Property listing URL (Zoopla / Rightmove preferred)'
                  : 'Purchase URL / product page'}
              </label>
              <input
                type="url"
                value={purchaseUrl}
                onChange={(e) =>
                  setPurchaseUrl(
                    e.target.value
                  )
                }
                placeholder={
                  isHome
                    ? 'e.g. https://www.zoopla.co.uk/...'
                    : 'e.g. product page or order link'
                }
                className="w-full rounded border px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-600">
                Internal notes
              </label>
              <textarea
                value={notesInternal}
                onChange={(e) =>
                  setNotesInternal(
                    e.target.value
                  )
                }
                rows={4}
                placeholder={
                  isHome
                    ? 'Survey notes, agent comments, anything you want Round to remember…'
                    : 'Order confirmation text, condition notes, etc.'
                }
                className="w-full rounded border px-2 py-1.5 text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-700">
              Receipt / key document
            </p>
            <div
              onDragOver={handleReceiptDragOver}
              onDrop={handleReceiptDrop}
              className="flex h-32 flex-col items-center justify-center rounded border border-dashed border-slate-300 bg-slate-50 text-center text-xs text-slate-600"
            >
              <p>
                Drag & drop a PDF or image
                here,
                <br />
                or click to choose from your
                computer.
              </p>
              <input
                type="file"
                accept="application/pdf,image/*"
                className="mt-2 text-xs"
                onChange={handleReceiptChange}
              />
              {receiptFile && (
                <p className="mt-2 text-[11px] text-slate-700">
                  Selected:{' '}
                  {receiptFile.name}
                </p>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              Round will eventually scan receipts and
              confirmations automatically – this is just
              the first step.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded border px-3 py-1.5 text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-black px-4 py-1.5 text-sm font-medium text-white disabled:bg-slate-500"
          >
            {submitting
              ? 'Saving…'
              : 'Save asset'}
          </button>
        </div>
      </form>
    </div>
  );
}
