'use client';

import { useEffect, useState, FormEvent } from 'react';
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
  current_estimated_value: number | null;
  estimate_currency: string | null;
  purchase_url: string | null;
  receipt_url: string | null;
  notes_internal: string | null;
  asset_type_id: string | null;
  category?: {
    name: string | null;
  } | null;
};

type Valuation = {
  id: string;
  valuation_source: string | null;
  suggested_value: number | null;
  currency: string | null;
  new_price_min: number | null;
  new_price_max: number | null;
  used_price_min: number | null;
  used_price_max: number | null;
  created_at: string;
};

type Upgrade = {
  id: string;
  title: string | null;
  description: string | null;
  upgrade_date: string | null;
  cost: number | null;
  currency: string | null;
};

type Service = {
  id: string;
  service_date: string | null;
  provider: string | null;
  description: string | null;
  cost: number | null;
  currency: string | null;
};

type Document = {
  id: string;
  doc_type: string | null;
  title: string | null;
  url: string | null;
  uploaded_at: string | null;
};

type IdentityLevel = 'unknown' | 'basic' | 'good' | 'strong';

function getCategoryName(asset: Asset | null) {
  if (!asset || !asset.category) return '—';
  return asset.category.name ?? '—';
}

function computeIdentity(asset: Asset | null): {
  level: IdentityLevel;
  label: string;
  shortLabel: string;
  colorClass: string;
} {
  if (!asset) {
    return {
      level: 'unknown',
      label: 'Identity: Unknown',
      shortLabel: 'Unknown',
      colorClass: 'bg-slate-100 text-slate-700 border-slate-200',
    };
  }

  const categoryName = getCategoryName(asset);
  const hasCategory = !!categoryName && categoryName !== '—';
  const hasBrand = !!asset.brand;
  const hasModel = !!asset.model_name;
  const hasSerial = !!asset.serial_number;

  let score = 0;
  if (hasCategory) score++;
  if (hasBrand) score++;
  if (hasModel) score++;
  if (hasSerial) score++;

  if (score >= 3) {
    return {
      level: 'strong',
      label:
        'Identity: Strong (brand, model, category and/or unique ID are clearly defined).',
      shortLabel: 'Strong',
      colorClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    };
  }

  if (score === 2) {
    return {
      level: 'good',
      label:
        'Identity: Good (at least two of brand, model and category are known).',
      shortLabel: 'Good',
      colorClass: 'bg-blue-100 text-blue-800 border-blue-200',
    };
  }

  if (score === 1) {
    return {
      level: 'basic',
      label:
        'Identity: Basic (Round has one signal, but would benefit from brand/model/category).',
      shortLabel: 'Basic',
      colorClass: 'bg-amber-100 text-amber-800 border-amber-200',
    };
  }

  return {
    level: 'unknown',
    label: 'Identity: Unknown',
    shortLabel: 'Unknown',
    colorClass: 'bg-slate-100 text-slate-700 border-slate-200',
  };
}

function formatMoney(
  value: number | null,
  currency: string | null = 'GBP'
): string {
  if (value == null) return '—';
  const cur = currency ?? 'GBP';
  if (cur === 'GBP') return `£${value.toFixed(0)}`;
  return `${cur} ${value.toFixed(0)}`;
}

function isMagicReady(asset: Asset | null): boolean {
  if (!asset) return false;
  const identity = computeIdentity(asset);
  const hasContext =
    !!asset.purchase_url || !!asset.notes_internal || !!asset.receipt_url;

  return (
    (identity.level === 'good' || identity.level === 'strong') && hasContext
  );
}

function isHomeLikeAsset(categoryName: string): boolean {
  const text = categoryName.toLowerCase();
  return (
    text.includes('home') ||
    text.includes('house') ||
    text.includes('flat') ||
    text.includes('apartment') ||
    text.includes('property') ||
    text.includes('real estate')
  );
}

export default function AssetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const assetId = params?.id as string;

  const [asset, setAsset] = useState<Asset | null>(null);
  const [valuations, setValuations] = useState<Valuation[]>([]);
  const [upgrades, setUpgrades] = useState<Upgrade[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [magicMessage, setMagicMessage] = useState<string | null>(null);
  const [magicLoading, setMagicLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Inline "Add upgrade" form state
  const [showUpgradeForm, setShowUpgradeForm] = useState(false);
  const [upgradeTitle, setUpgradeTitle] = useState('');
  const [upgradeDescription, setUpgradeDescription] = useState('');
  const [upgradeDate, setUpgradeDate] = useState('');
  const [upgradeCost, setUpgradeCost] = useState('');
  const [upgradeSaving, setUpgradeSaving] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  useEffect(() => {
    if (!assetId) return;

    const load = async () => {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      setUserId(user.id);

      // 1) Load the asset (with category)
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
          current_estimated_value,
          estimate_currency,
          purchase_url,
          receipt_url,
          notes_internal,
          asset_type_id,
          category:categories ( name )
        `
        )
        .eq('id', assetId)
        .eq('owner_id', user.id)
        .single();

      if (assetError || !assetData) {
        setLoading(false);
        router.push('/dashboard');
        return;
      }

      // Normalise category array → single object
      const normalisedAsset: Asset = {
        ...(assetData as any),
        category: Array.isArray((assetData as any).category)
          ? (assetData as any).category[0] ?? null
          : (assetData as any).category ?? null,
      };

      setAsset(normalisedAsset);

      // 2) Load valuations
      const { data: valData } = await supabase
        .from('valuations')
        .select(
          `
          id,
          valuation_source,
          suggested_value,
          currency,
          new_price_min,
          new_price_max,
          used_price_min,
          used_price_max,
          created_at
        `
        )
        .eq('asset_id', assetId)
        .order('created_at', { ascending: false });

      if (valData) {
        setValuations(valData as Valuation[]);
      }

      // 3) Load upgrades
      const { data: upData, error: upError } = await supabase
        .from('asset_upgrades')
        .select(
          `
          id,
          title,
          description,
          upgrade_date,
          cost,
          currency
        `
        )
        .eq('asset_id', assetId)
        .order('upgrade_date', { ascending: false });

      if (!upError && upData) {
        setUpgrades(upData as Upgrade[]);
      }

      // 4) Load services
      const { data: svcData, error: svcError } = await supabase
        .from('asset_services')
        .select(
          `
          id,
          service_date,
          provider,
          description,
          cost,
          currency
        `
        )
        .eq('asset_id', assetId)
        .order('service_date', { ascending: false });

      if (!svcError && svcData) {
        setServices(svcData as Service[]);
      }

      // 5) Load documents
      const { data: docData, error: docError } = await supabase
        .from('asset_documents')
        .select(
          `
          id,
          doc_type,
          title,
          url,
          uploaded_at
        `
        )
        .eq('asset_id', assetId)
        .order('uploaded_at', { ascending: false });

      if (!docError && docData) {
        setDocuments(docData as Document[]);
      }

      setLoading(false);
    };

    load();
  }, [assetId, router]);

  const handleBack = () => {
    router.push('/dashboard');
  };

  const handleEdit = () => {
    router.push(`/assets/${assetId}/edit`);
  };

  const handleMagicImportClick = () => {
    if (!asset) return;
    setMagicLoading(true);
    setMagicMessage(
      'Magic Import is a future feature: Round will scan receipts, emails and links to suggest live valuations and market matches for this asset.'
    );
    setTimeout(() => {
      setMagicLoading(false);
    }, 600);
  };

  const handleUpgradeSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!assetId || !userId) return;

    setUpgradeError(null);
    setUpgradeSaving(true);

    try {
      const costNumber = upgradeCost ? parseFloat(upgradeCost) : null;

      const { data, error } = await supabase
        .from('asset_upgrades')
        .insert({
          asset_id: assetId,
          // if your table has owner_id, this will keep things clean
          owner_id: userId,
          title: upgradeTitle || null,
          description: upgradeDescription || null,
          upgrade_date: upgradeDate || null,
          cost: costNumber,
          currency: 'GBP',
        } as any)
        .select()
        .single();

      if (error || !data) {
        console.error(error);
        throw new Error('Could not save upgrade.');
      }

      // Prepend new upgrade to the list
      setUpgrades(prev => [data as Upgrade, ...prev]);

      // Reset form
      setUpgradeTitle('');
      setUpgradeDescription('');
      setUpgradeDate('');
      setUpgradeCost('');
      setShowUpgradeForm(false);
    } catch (err: any) {
      console.error(err);
      setUpgradeError(err.message || 'Something went wrong while saving.');
    } finally {
      setUpgradeSaving(false);
    }
  };

  if (loading || !asset) {
    return <div className="p-6">Loading asset…</div>;
  }

  const identity = computeIdentity(asset);
  const magicReady = isMagicReady(asset);
  const categoryName = getCategoryName(asset);
  const isHome = isHomeLikeAsset(categoryName);

  return (
    <div className="space-y-4 p-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={handleBack}
          className="text-sm text-slate-500 underline"
        >
          ← Back to portfolio
        </button>
        <button
          onClick={handleEdit}
          className="rounded border px-3 py-1 text-sm"
        >
          Edit asset
        </button>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{asset.title}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {categoryName !== '—' && (
              <>
                <span className="font-medium">{categoryName}</span>
                {' · '}
              </>
            )}
            {asset.brand && <span>{asset.brand}</span>}
            {asset.brand && asset.model_name && <span> · </span>}
            {asset.model_name && <span>{asset.model_name}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${identity.colorClass}`}
            title={identity.label}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            Identity: {identity.shortLabel}
          </span>
          {magicReady && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800"
              title="Magic-Ready: Round has enough identity and context to start automated valuations."
            >
              ✨ Magic-Ready
            </span>
          )}
          {asset.status && (
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs capitalize text-slate-700">
              Status: {asset.status}
            </span>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Value card */}
        <div className="rounded border bg-slate-50 p-4 text-sm">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Value
          </p>
          <p className="text-xs text-slate-500">Purchase price</p>
          <p className="text-lg font-semibold">
            {formatMoney(asset.purchase_price, asset.purchase_currency)}
          </p>
          <p className="mt-3 text-xs text-slate-500">Current estimate</p>
          <p className="text-lg font-semibold">
            {formatMoney(
              asset.current_estimated_value,
              asset.estimate_currency
            )}
          </p>
          <p className="mt-3 text-[11px] text-slate-500">
            In the future, Round will keep these numbers in sync with the
            market automatically.
          </p>
        </div>

        {/* Magic Import card */}
        <div className="rounded border bg-white p-4 text-sm">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Magic Import
          </p>
          <p className="mb-3 text-xs text-slate-600">
            Magic Import will let Round scan receipts, emails and purchase
            links to infer the exact product and pull live valuations,
            comparables and replacement options.
          </p>
          <button
            type="button"
            onClick={handleMagicImportClick}
            disabled={!magicReady || magicLoading}
            className={`rounded px-3 py-1.5 text-xs font-medium ${
              magicReady
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-slate-200 text-slate-500 cursor-not-allowed'
            }`}
          >
            {magicLoading
              ? 'Preparing Magic Import…'
              : magicReady
              ? 'Run Magic Import (demo)'
              : 'Magic Import needs more info'}
          </button>
          <p className="mt-2 text-[11px] text-slate-500">
            Magic Import needs a strong identity plus at least one context
            source (purchase URL, notes or receipt).
          </p>
          {magicMessage && (
            <p className="mt-3 rounded border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
              {magicMessage}
            </p>
          )}
        </div>

        {/* Docs / links card */}
        <div className="rounded border bg-white p-4 text-sm">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Links & receipts
          </p>
          <ul className="space-y-1 text-xs text-slate-700">
            <li>
              <span className="font-medium">Purchase URL: </span>
              {asset.purchase_url ? (
                <a
                  href={asset.purchase_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 underline"
                >
                  Open link
                </a>
              ) : (
                <span className="text-slate-500">Not yet added</span>
              )}
            </li>
            <li>
              <span className="font-medium">Receipt PDF: </span>
              {asset.receipt_url ? (
                <a
                  href={asset.receipt_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 underline"
                >
                  View receipt
                </a>
              ) : (
                <span className="text-slate-500">Not yet uploaded</span>
              )}
            </li>
          </ul>
          {asset.notes_internal && (
            <div className="mt-3">
              <p className="mb-1 text-xs font-medium text-slate-500">
                Notes / context
              </p>
              <p className="rounded bg-slate-50 p-2 text-[11px] text-slate-700">
                {asset.notes_internal}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Valuation history */}
      <div className="rounded border bg-white p-4 text-sm">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Valuation history
          </p>
        </div>
        {valuations.length === 0 ? (
          <p className="mt-2 text-xs text-slate-600">
            No valuations recorded yet. For now, you can update the current
            estimate manually. In the future, Round will add automated
            valuations here.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {valuations.map(v => (
              <div
                key={v.id}
                className="flex items-center justify-between rounded border border-slate-100 bg-slate-50 px-3 py-2 text-xs"
              >
                <div>
                  <p className="font-medium">
                    {v.suggested_value != null
                      ? formatMoney(v.suggested_value, v.currency)
                      : '—'}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Source:{' '}
                    {v.valuation_source
                      ? v.valuation_source
                      : 'Unknown source'}
                  </p>
                </div>
                <div className="text-right text-[11px] text-slate-500">
                  <p>
                    {new Date(v.created_at).toLocaleDateString('en-GB', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                  {(v.new_price_min || v.used_price_min) && (
                    <p className="mt-1">
                      New:{' '}
                      {v.new_price_min != null || v.new_price_max != null
                        ? `${formatMoney(
                            v.new_price_min,
                            v.currency
                          )}–${formatMoney(
                            v.new_price_max,
                            v.currency
                          )}`
                        : '—'}
                      {' · '}
                      Used:{' '}
                      {v.used_price_min != null || v.used_price_max != null
                        ? `${formatMoney(
                            v.used_price_min,
                            v.currency
                          )}–${formatMoney(
                            v.used_price_max,
                            v.currency
                          )}`
                        : '—'}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Home container sections */}
      {isHome && (
        <div className="grid gap-4 md:grid-cols-3">
          {/* Upgrades */}
          <div className="rounded border bg-white p-4 text-sm md:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Upgrades & improvements
              </p>
              <button
                type="button"
                className="text-xs text-blue-600 underline"
                onClick={() => setShowUpgradeForm(prev => !prev)}
              >
                {showUpgradeForm ? 'Cancel' : '+ Add upgrade'}
              </button>
            </div>

            {showUpgradeForm && (
              <form onSubmit={handleUpgradeSubmit} className="mb-3 space-y-2">
                <div className="grid gap-2 md:grid-cols-3">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium">
                      Title
                    </label>
                    <input
                      type="text"
                      value={upgradeTitle}
                      onChange={e => setUpgradeTitle(e.target.value)}
                      className="w-full rounded border px-2 py-1 text-xs"
                      placeholder="e.g. Kitchen refurbishment"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium">
                      Date
                    </label>
                    <input
                      type="date"
                      value={upgradeDate}
                      onChange={e => setUpgradeDate(e.target.value)}
                      className="w-full rounded border px-2 py-1 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium">
                      Cost (GBP)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={upgradeCost}
                      onChange={e => setUpgradeCost(e.target.value)}
                      className="w-full rounded border px-2 py-1 text-xs"
                      placeholder="e.g. 1000"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium">
                    Description
                  </label>
                  <textarea
                    value={upgradeDescription}
                    onChange={e => setUpgradeDescription(e.target.value)}
                    className="w-full rounded border px-2 py-1 text-xs"
                    rows={2}
                    placeholder="What was upgraded? e.g. New Corston switches throughout ground floor."
                  />
                </div>
                {upgradeError && (
                  <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700">
                    {upgradeError}
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="text-xs text-slate-500"
                    onClick={() => {
                      setShowUpgradeForm(false);
                      setUpgradeError(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={upgradeSaving}
                    className="rounded bg-black px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
                  >
                    {upgradeSaving ? 'Saving…' : 'Save upgrade'}
                  </button>
                </div>
              </form>
            )}

            {upgrades.length === 0 ? (
              <p className="text-xs text-slate-600">
                Use this section to capture major upgrades to your home –
                kitchens, bathrooms, extensions, windows, heating, etc. Each
                line becomes part of the home&apos;s value story.
              </p>
            ) : (
              <ul className="space-y-2">
                {upgrades.map(u => (
                  <li
                    key={u.id}
                    className="rounded border border-slate-100 bg-slate-50 px-3 py-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium">
                        {u.title ?? 'Untitled upgrade'}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {u.upgrade_date
                          ? new Date(u.upgrade_date).toLocaleDateString(
                              'en-GB',
                              {
                                year: 'numeric',
                                month: 'short',
                              }
                            )
                          : ''}
                      </p>
                    </div>
                    {u.description && (
                      <p className="mt-1 text-[11px] text-slate-600">
                        {u.description}
                      </p>
                    )}
                    {u.cost != null && (
                      <p className="mt-1 text-[11px] text-slate-500">
                        Cost: {formatMoney(u.cost, u.currency ?? 'GBP')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Service history */}
          <div className="rounded border bg-white p-4 text-sm">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              Home service history
            </p>
            {services.length === 0 ? (
              <p className="text-xs text-slate-600">
                Track things like boiler services, chimney sweeps, safety
                checks and inspections here – effectively a service book for
                your home.
              </p>
            ) : (
              <ul className="space-y-2">
                {services.map(s => (
                  <li
                    key={s.id}
                    className="rounded border border-slate-100 bg-slate-50 px-3 py-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium">
                        {s.description ?? 'Service'}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {s.service_date
                          ? new Date(s.service_date).toLocaleDateString(
                              'en-GB',
                              {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              }
                            )
                          : ''}
                      </p>
                    </div>
                    {s.provider && (
                      <p className="mt-1 text-[11px] text-slate-600">
                        Provider: {s.provider}
                      </p>
                    )}
                    {s.cost != null && (
                      <p className="mt-1 text-[11px] text-slate-500">
                        Cost: {formatMoney(s.cost, s.currency ?? 'GBP')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Key documents (for all asset types) */}
      <div className="rounded border bg-white p-4 text-sm">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          Key documents
        </p>
        {documents.length === 0 ? (
          <p className="text-xs text-slate-600">
            Use this space to link important documents such as surveys, title
            docs, guarantees, safety certificates or manuals. For now this is
            read-only – in the future you&apos;ll be able to upload files
            directly.
          </p>
        ) : (
          <ul className="space-y-2 text-xs text-slate-700">
            {documents.map(d => (
              <li
                key={d.id}
                className="flex items-center justify-between rounded border border-slate-100 bg-slate-50 px-3 py-2"
              >
                <div>
                  <p className="font-medium">
                    {d.title ?? d.doc_type ?? 'Document'}
                  </p>
                  {d.doc_type && (
                    <p className="text-[11px] text-slate-500">
                      Type: {d.doc_type}
                    </p>
                  )}
                </div>
                <div className="text-right text-[11px]">
                  {d.uploaded_at && (
                    <p className="mb-1 text-slate-500">
                      {new Date(d.uploaded_at).toLocaleDateString('en-GB', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                  )}
                  {d.url ? (
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 underline"
                    >
                      Open
                    </a>
                  ) : (
                    <span className="text-slate-500">No link</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
