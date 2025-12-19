'use client';

import {
  useEffect,
  useState,
  ChangeEvent,
  DragEvent,
} from 'react';
import {
  useParams,
  useRouter,
} from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type Category = {
  id: string;
  name: string | null;
};

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
  category_id: string | null;
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

export default function EditAssetPage() {
  const params = useParams();
  const router = useRouter();
  const assetId = params?.id as string;

  const [categories, setCategories] = useState<Category[]>([]);
  const [asset, setAsset] = useState<Asset | null>(
    null
  );

  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');

  const [brand, setBrand] = useState('');
  const [modelName, setModelName] = useState('');
  const [serialNumber, setSerialNumber] = useState('');

  const [status, setStatus] = useState<
    string | null
  >(null);

  const [purchasePrice, setPurchasePrice] =
    useState('');
  const [purchaseCurrency, setPurchaseCurrency] =
    useState('GBP');
  const [purchaseDate, setPurchaseDate] =
    useState('');

  const [
    currentEstimatedValue,
    setCurrentEstimatedValue,
  ] = useState('');
  const [estimateCurrency, setEstimateCurrency] =
    useState('GBP');

  const [purchaseUrl, setPurchaseUrl] =
    useState('');
  const [notesInternal, setNotesInternal] =
    useState('');

  const [existingReceiptUrl, setExistingReceiptUrl] =
    useState<string | null>(null);
  const [receiptFile, setReceiptFile] =
    useState<File | null>(null);

  const [loading, setLoading] =
    useState(true);
  const [saving, setSaving] =
    useState(false);
  const [error, setError] = useState<
    string | null
  >(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      const { data: catData, error: catError } =
        await supabase
          .from('categories')
          .select('id, name')
          .order('name');

      if (!catError && catData) {
        setCategories(catData as Category[]);
      }

      const {
        data: assetData,
        error: assetError,
      } = await supabase
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
          country,
          category_id
        `
        )
        .eq('id', assetId)
        .eq('owner_id', user.id)
        .single();

      if (assetError || !assetData) {
        console.error(assetError);
        setError('Could not load this asset.');
        setLoading(false);
        return;
      }

      const a = assetData as Asset;
      setAsset(a);

      setTitle(a.title || '');
      setCategoryId(a.category_id || '');
      setCity(a.city || '');
      setCountry(a.country || '');
      setBrand(a.brand || '');
      setModelName(a.model_name || '');
      setSerialNumber(a.serial_number || '');
      setStatus(a.status);
      setPurchasePrice(
        a.purchase_price != null
          ? String(a.purchase_price)
          : ''
      );
      setPurchaseCurrency(
        a.purchase_currency || 'GBP'
      );
      setPurchaseDate(a.purchase_date || '');
      setCurrentEstimatedValue(
        a.current_estimated_value != null
          ? String(a.current_estimated_value)
          : ''
      );
      setEstimateCurrency(
        a.estimate_currency ||
          a.purchase_currency ||
          'GBP'
      );
      setPurchaseUrl(a.purchase_url || '');
      setNotesInternal(a.notes_internal || '');
      setExistingReceiptUrl(a.receipt_url);

      setLoading(false);
    };

    if (assetId) {
      loadData();
    }
  }, [assetId, router]);

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

  const handleSave = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();
    if (!asset) return;

    setSaving(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      let receiptUrl = existingReceiptUrl;

      if (receiptFile) {
        const bucket = 'receipts';
        const safeName = receiptFile.name.replace(
          /[^\w.\-]+/g,
          '_'
        );
        const path = `${user.id}/${asset.id}/${Date.now()}-${safeName}`;

        const { error: uploadError } =
          await supabase.storage
            .from(bucket)
            .upload(path, receiptFile, {
              upsert: true,
            });

        if (uploadError) {
          console.error(uploadError);
          setError('Could not upload receipt.');
          setSaving(false);
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

      const updates: any = {
        title: title || null,
        category_id: categoryId || null,
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
        status: status || null,
        receipt_url: receiptUrl,
      };

      if (isHome) {
        updates.brand = null;
        updates.model_name = null;
        updates.serial_number = null;
      } else {
        updates.brand = brand || null;
        updates.model_name =
          modelName || null;
        updates.serial_number =
          serialNumber || null;
      }

      const { error: updateError } =
        await supabase
          .from('assets')
          .update(updates)
          .eq('id', asset.id)
          .eq('owner_id', user.id);

      if (updateError) {
        console.error(updateError);
        setError('Could not save changes.');
        setSaving(false);
        return;
      }

      router.push(`/assets/${asset.id}`);
    } catch (err) {
      console.error(err);
      setError(
        'Something went wrong while saving.'
      );
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (asset) {
      router.push(`/assets/${asset.id}`);
    } else {
      router.push('/dashboard');
    }
  };

  const handleDelete = async () => {
    if (
      !asset ||
      !window.confirm(
        'Delete this asset and all its data from Round? This cannot be undone.'
      )
    ) {
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      const { error: deleteError } =
        await supabase
          .from('assets')
          .delete()
          .eq('id', asset.id)
          .eq('owner_id', user.id);

      if (deleteError) {
        console.error(deleteError);
        setError('Could not delete asset.');
        return;
      }

      router.push('/dashboard');
    } catch (err) {
      console.error(err);
      setError(
        'Something went wrong while deleting.'
      );
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        Loading asset…
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="p-6">
        <p className="mb-2 text-sm text-red-600">
          Could not find this asset.
        </p>
        <button
          className="rounded border px-3 py-1.5 text-sm"
          onClick={() =>
            router.push('/dashboard')
          }
        >
          Back to portfolio
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          Edit asset
        </h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded border px-3 py-1.5 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="rounded border border-red-500 px-3 py-1.5 text-sm text-red-600"
          >
            Delete asset
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSave}
        className="space-y-6 rounded border bg-white p-4 text-sm"
      >
        {/* Identity */}
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
              className="w-full rounded border px-2 py-1.5 text-sm"
            />

            <label className="mt-3 block text-xs font-medium text-slate-700">
              Category
            </label>
            <select
              value={categoryId}
              onChange={(e) =>
                setCategoryId(
                  e.target.value
                )
              }
              required
              className="w-full rounded border px-2 py-1.5 text-sm"
            >
              <option value="">
                Select category
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
                    setCountry(
                      e.target.value
                    )
                  }
                  className="w-full rounded border px-2 py-1.5 text-sm"
                />
              </div>
            </div>

            <div className="mt-3">
              <label className="block text-xs font-medium text-slate-700">
                Status
              </label>
              <select
                value={status || ''}
                onChange={(e) =>
                  setStatus(
                    e.target.value || null
                  )
                }
                className="w-full rounded border px-2 py-1.5 text-sm"
              >
                <option value="">
                  Unknown
                </option>
                <option value="owned">
                  Owned
                </option>
                <option value="for_sale">
                  For sale
                </option>
                <option value="sold">
                  Sold
                </option>
                <option value="archived">
                  Archived
                </option>
              </select>
            </div>
          </div>

          {/* Brand/Model – hidden for homes */}
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
                      setModelName(
                        e.target.value
                      )
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

        {/* Value */}
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
              Still manual for now – later Round will keep
              this in sync with live market data.
            </p>
          </div>
        </div>

        {/* Context & receipt */}
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
                className="w-full rounded border px-2 py-1.5 text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-700">
              Receipt / key document
            </p>
            {existingReceiptUrl && !receiptFile && (
              <p className="text-[11px] text-slate-600">
                Existing receipt stored. Upload a new file
                below to replace it.
              </p>
            )}
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
                  New selected file:{' '}
                  {receiptFile.name}
                </p>
              )}
            </div>
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
            disabled={saving}
            className="rounded bg-black px-4 py-1.5 text-sm font-medium text-white disabled:bg-slate-500"
          >
            {saving
              ? 'Saving…'
              : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
