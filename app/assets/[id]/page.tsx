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

/**
 * Upload a file to the "documents" bucket and return its public URL.
 */
async function uploadDocumentToBucket(file: File, assetId: string) {
  const ext = file.name.split('.').pop() || 'bin';
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const path = `${assetId}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.${ext}`;

  const { data, error } = await supabase
    .storage
    .from('documents')
    .upload(path, file);

  if (error || !data) {
    console.error('Upload error:', error);
    throw new Error('Could not upload file. Please try again.');
  }

  const { data: publicData } = supabase
    .storage
    .from('documents')
    .getPublicUrl(data.path);

  return publicData.publicUrl;
}

export default function AssetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const assetId = params?.id as string;

  const [asset, setAsset] = useState<Asset | null>(null);
  const [valuations, setValuations] = useState<Valuation[]>([]);
  const [upgrades, setUpgrades] = useState<Upgrade[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [assetDocuments, setAssetDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  const [magicMessage, setMagicMessage] = useState<string | null>(null);
  const [magicLoading, setMagicLoading] = useState(false);

  // Upgrades – create
  const [showUpgradeForm, setShowUpgradeForm] = useState(false);
  const [upgradeTitle, setUpgradeTitle] = useState('');
  const [upgradeDescription, setUpgradeDescription] = useState('');
  const [upgradeDate, setUpgradeDate] = useState('');
  const [upgradeCost, setUpgradeCost] = useState('');
  const [upgradeSaving, setUpgradeSaving] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  // Upgrades – edit
  const [editingUpgradeId, setEditingUpgradeId] = useState<string | null>(null);
  const [editUpgradeTitle, setEditUpgradeTitle] = useState('');
  const [editUpgradeDescription, setEditUpgradeDescription] = useState('');
  const [editUpgradeDate, setEditUpgradeDate] = useState('');
  const [editUpgradeCost, setEditUpgradeCost] = useState('');
  const [editUpgradeSaving, setEditUpgradeSaving] = useState(false);
  const [editUpgradeError, setEditUpgradeError] = useState<string | null>(null);

  // Services – create
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [serviceDate, setServiceDate] = useState('');
  const [serviceProvider, setServiceProvider] = useState('');
  const [serviceDescription, setServiceDescription] = useState('');
  const [serviceCost, setServiceCost] = useState('');
  const [serviceSaving, setServiceSaving] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);

  // Services – edit
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [editServiceDate, setEditServiceDate] = useState('');
  const [editServiceProvider, setEditServiceProvider] = useState('');
  const [editServiceDescription, setEditServiceDescription] = useState('');
  const [editServiceCost, setEditServiceCost] = useState('');
  const [editServiceSaving, setEditServiceSaving] = useState(false);
  const [editServiceError, setEditServiceError] = useState<string | null>(null);

  // Asset-level document form
  const [showDocumentForm, setShowDocumentForm] = useState(false);
  const [docType, setDocType] = useState('');
  const [docTitle, setDocTitle] = useState('');
  const [docUrl, setDocUrl] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docDragOver, setDocDragOver] = useState(false);
  const [docSaving, setDocSaving] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

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

      // 1) Asset
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

      const normalisedAsset: Asset = {
        ...(assetData as any),
        category: Array.isArray((assetData as any).category)
          ? (assetData as any).category[0] ?? null
          : (assetData as any).category ?? null,
      };

      setAsset(normalisedAsset);

      // 2) Valuations
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

      // 3) Upgrades
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

      // 4) Services
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

      // 5) Asset-level documents
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
        setAssetDocuments(docData as Document[]);
      }

      setLoading(false);
    };

    load();
  }, [assetId, router]);

  const handleBack = () => {
    router.push('/dashboard');
  };

  const handleEditAsset = () => {
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

  // CREATE upgrade
  const handleUpgradeSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!assetId) return;

    setUpgradeError(null);
    setUpgradeSaving(true);

    try {
      const costNumber = upgradeCost ? parseFloat(upgradeCost) : null;

      const { data, error } = await supabase
        .from('asset_upgrades')
        .insert({
          asset_id: assetId,
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

      setUpgrades(prev => [data as Upgrade, ...prev]);

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

  // EDIT upgrade
  const startEditUpgrade = (u: Upgrade) => {
    setEditingUpgradeId(u.id);
    setEditUpgradeTitle(u.title ?? '');
    setEditUpgradeDescription(u.description ?? '');
    setEditUpgradeDate(u.upgrade_date ?? '');
    setEditUpgradeCost(u.cost != null ? String(u.cost) : '');
    setEditUpgradeError(null);
  };

  const cancelEditUpgrade = () => {
    setEditingUpgradeId(null);
    setEditUpgradeTitle('');
    setEditUpgradeDescription('');
    setEditUpgradeDate('');
    setEditUpgradeCost('');
    setEditUpgradeError(null);
  };

  const handleUpgradeUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingUpgradeId) return;

    setEditUpgradeError(null);
    setEditUpgradeSaving(true);

    try {
      const costNumber = editUpgradeCost ? parseFloat(editUpgradeCost) : null;

      const { data, error } = await supabase
        .from('asset_upgrades')
        .update({
          title: editUpgradeTitle || null,
          description: editUpgradeDescription || null,
          upgrade_date: editUpgradeDate || null,
          cost: costNumber,
        } as any)
        .eq('id', editingUpgradeId)
        .select()
        .single();

      if (error || !data) {
        console.error(error);
        throw new Error('Could not update upgrade.');
      }

      const updated = data as Upgrade;

      setUpgrades(prev =>
        prev.map(u => (u.id === updated.id ? updated : u))
      );

      cancelEditUpgrade();
    } catch (err: any) {
      console.error(err);
      setEditUpgradeError(
        err.message || 'Something went wrong while updating.'
      );
    } finally {
      setEditUpgradeSaving(false);
    }
  };

  // CREATE service
  const handleServiceSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!assetId) return;

    setServiceError(null);
    setServiceSaving(true);

    try {
      const costNumber = serviceCost ? parseFloat(serviceCost) : null;

      const { data, error } = await supabase
        .from('asset_services')
        .insert({
          asset_id: assetId,
          service_date: serviceDate || null,
          provider: serviceProvider || null,
          description: serviceDescription || null,
          cost: costNumber,
          currency: 'GBP',
        } as any)
        .select()
        .single();

      if (error || !data) {
        console.error(error);
        throw new Error('Could not save service.');
      }

      setServices(prev => [data as Service, ...prev]);

      setServiceDate('');
      setServiceProvider('');
      setServiceDescription('');
      setServiceCost('');
      setShowServiceForm(false);
    } catch (err: any) {
      console.error(err);
      setServiceError(err.message || 'Something went wrong while saving.');
    } finally {
      setServiceSaving(false);
    }
  };

  // EDIT service
  const startEditService = (s: Service) => {
    setEditingServiceId(s.id);
    setEditServiceDate(s.service_date ?? '');
    setEditServiceProvider(s.provider ?? '');
    setEditServiceDescription(s.description ?? '');
    setEditServiceCost(s.cost != null ? String(s.cost) : '');
    setEditServiceError(null);
  };

  const cancelEditService = () => {
    setEditingServiceId(null);
    setEditServiceDate('');
    setEditServiceProvider('');
    setEditServiceDescription('');
    setEditServiceCost('');
    setEditServiceError(null);
  };

  const handleServiceUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingServiceId) return;

    setEditServiceError(null);
    setEditServiceSaving(true);

    try {
      const costNumber = editServiceCost ? parseFloat(editServiceCost) : null;

      const { data, error } = await supabase
        .from('asset_services')
        .update({
          service_date: editServiceDate || null,
          provider: editServiceProvider || null,
          description: editServiceDescription || null,
          cost: costNumber,
        } as any)
        .eq('id', editingServiceId)
        .select()
        .single();

      if (error || !data) {
        console.error(error);
        throw new Error('Could not update service.');
      }

      const updated = data as Service;

      setServices(prev =>
        prev.map(s => (s.id === updated.id ? updated : s))
      );

      cancelEditService();
    } catch (err: any) {
      console.error(err);
      setEditServiceError(
        err.message || 'Something went wrong while updating.'
      );
    } finally {
      setEditServiceSaving(false);
    }
  };

  // CREATE asset-level document
  const handleDocumentSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!assetId) return;

    setDocError(null);
    setDocSaving(true);

    try {
      let finalUrl: string | null = docUrl || null;

      if (docFile) {
        finalUrl = await uploadDocumentToBucket(docFile, assetId);
      }

      if (!finalUrl) {
        throw new Error('Please provide either a URL or upload a file.');
      }

      const { data, error } = await supabase
        .from('asset_documents')
        .insert({
          asset_id: assetId,
          doc_type: docType || null,
          title: docTitle || null,
          url: finalUrl,
        } as any)
        .select()
        .single();

      if (error || !data) {
        console.error(error);
        throw new Error('Could not save document.');
      }

      const doc = data as Document;
      setAssetDocuments(prev => [doc, ...prev]);

      setDocType('');
      setDocTitle('');
      setDocUrl('');
      setDocFile(null);
      setShowDocumentForm(false);
    } catch (err: any) {
      console.error(err);
      setDocError(err.message || 'Something went wrong while saving.');
    } finally {
      setDocSaving(false);
    }
  };

  if (loading || !asset) {
    return <div className="p-6">Loading asset…</div>;
  }

  const identity = computeIdentity(asset);
  const magicReady = isMagicReady(asset);
  const categoryName = getCategoryName(asset);
  const isHome = isHomeLikeAsset(categoryName);

  const upgradesTotal = upgrades.reduce(
    (sum, u) => sum + (u.cost ?? 0),
    0
  );

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
          onClick={handleEditAsset}
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

          <p className="mt-3 text-xs text-slate-500">
            Total upgrades invested
          </p>
          <p className="text-sm font-medium">
            {formatMoney(upgradesTotal, 'GBP')}
          </p>

          <p className="mt-3 text-xs text-slate-500">Current estimate</p>
          <p className="text-lg font-semibold">
            {formatMoney(
              asset.current_estimated_value,
              asset.estimate_currency
            )}
          </p>
          <p className="mt-3 text-[11px] text-slate-500">
            Over time, Round will connect these data points to live market
            signals so you can see how your investment into this asset is
            tracking.
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
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Valuation history
          </p>
        </div>
        {valuations.length === 0 ? (
          <p className="text-xs text-slate-600">
            Once Round starts pulling live price signals, you&apos;ll see
            valuation events for this asset here – new, used and suggested
            fair value.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="px-2 py-1 text-left">Date</th>
                  <th className="px-2 py-1 text-left">Source</th>
                  <th className="px-2 py-1 text-right">Suggested</th>
                  <th className="px-2 py-1 text-right">New range</th>
                  <th className="px-2 py-1 text-right">Used range</th>
                </tr>
              </thead>
              <tbody>
                {valuations.map(v => (
                  <tr key={v.id} className="border-b">
                    <td className="px-2 py-1">
                      {new Date(v.created_at).toLocaleDateString('en-GB', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td className="px-2 py-1">
                      {v.valuation_source ?? '—'}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {formatMoney(v.suggested_value, v.currency)}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {v.new_price_min == null && v.new_price_max == null
                        ? '—'
                        : `${formatMoney(
                            v.new_price_min,
                            v.currency
                          )} – ${formatMoney(v.new_price_max, v.currency)}`}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {v.used_price_min == null && v.used_price_max == null
                        ? '—'
                        : `${formatMoney(
                            v.used_price_min,
                            v.currency
                          )} – ${formatMoney(v.used_price_max, v.currency)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Home container sections */}
      {isHome && (
        <>
          {/* Upgrades & improvements */}
          <div className="rounded border bg-white p-4 text-sm">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Upgrades &amp; improvements
              </p>
              <button
                type="button"
                className="text-xs text-blue-600 underline"
                onClick={() => {
                  setShowUpgradeForm(prev => !prev);
                  setUpgradeError(null);
                }}
              >
                {showUpgradeForm ? 'Cancel' : '+ Add upgrade'}
              </button>
            </div>

            <p className="mb-2 text-[11px] text-slate-500">
              Use this to log investments that upgrade or enhance the home:
              kitchens, bathrooms, flooring, rewiring, windows, extensions,
              joinery and other improvements that affect long-term value.
            </p>

            {showUpgradeForm && (
              <form
                onSubmit={handleUpgradeSubmit}
                className="mb-3 space-y-2 rounded border border-slate-200 bg-slate-50 p-3"
              >
                <div className="grid gap-2 md:grid-cols-3">
                  <div className="space-y-1 md:col-span-2">
                    <label className="block text-[11px] font-medium">
                      Title
                    </label>
                    <input
                      type="text"
                      value={upgradeTitle}
                      onChange={e => setUpgradeTitle(e.target.value)}
                      className="w-full rounded border px-2 py-1 text-xs"
                      placeholder="e.g. New kitchen, Loft conversion"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium">
                      Date (approx.)
                    </label>
                    <input
                      type="date"
                      value={upgradeDate}
                      onChange={e => setUpgradeDate(e.target.value)}
                      className="w-full rounded border px-2 py-1 text-xs"
                    />
                  </div>
                </div>

                <div className="grid gap-2 md:grid-cols-3">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium">
                      Cost (GBP)
                    </label>
                    <input
                      type="number"
                      value={upgradeCost}
                      onChange={e => setUpgradeCost(e.target.value)}
                      className="w-full rounded border px-2 py-1 text-xs"
                      placeholder="e.g. 12500"
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="block text-[11px] font-medium">
                      Description
                    </label>
                    <textarea
                      value={upgradeDescription}
                      onChange={e =>
                        setUpgradeDescription(e.target.value)
                      }
                      className="min-h-[48px] w-full rounded border px-2 py-1 text-xs"
                      placeholder="Materials, supplier, rooms affected, rationale…"
                    />
                  </div>
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
                You haven&apos;t logged any upgrades yet. Start with the
                bigger ticket items (kitchen, bathrooms, windows, structural
                work) so Round can tell a clearer story about total
                investment vs value.
              </p>
            ) : (
              <div className="space-y-2">
                {upgrades.map(u =>
                  editingUpgradeId === u.id ? (
                    <form
                      key={u.id}
                      onSubmit={handleUpgradeUpdate}
                      className="space-y-2 rounded border border-blue-200 bg-blue-50 p-3 text-xs"
                    >
                      <div className="grid gap-2 md:grid-cols-3">
                        <div className="space-y-1 md:col-span-2">
                          <label className="block text-[11px] font-medium">
                            Title
                          </label>
                          <input
                            type="text"
                            value={editUpgradeTitle}
                            onChange={e =>
                              setEditUpgradeTitle(e.target.value)
                            }
                            className="w-full rounded border px-2 py-1 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[11px] font-medium">
                            Date
                          </label>
                          <input
                            type="date"
                            value={editUpgradeDate}
                            onChange={e =>
                              setEditUpgradeDate(e.target.value)
                            }
                            className="w-full rounded border px-2 py-1 text-xs"
                          />
                        </div>
                      </div>

                      <div className="grid gap-2 md:grid-cols-3">
                        <div className="space-y-1">
                          <label className="block text-[11px] font-medium">
                            Cost (GBP)
                          </label>
                          <input
                            type="number"
                            value={editUpgradeCost}
                            onChange={e =>
                              setEditUpgradeCost(e.target.value)
                            }
                            className="w-full rounded border px-2 py-1 text-xs"
                          />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <label className="block text-[11px] font-medium">
                            Description
                          </label>
                          <textarea
                            value={editUpgradeDescription}
                            onChange={e =>
                              setEditUpgradeDescription(e.target.value)
                            }
                            className="min-h-[48px] w-full rounded border px-2 py-1 text-xs"
                          />
                        </div>
                      </div>

                      {editUpgradeError && (
                        <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700">
                          {editUpgradeError}
                        </div>
                      )}

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="text-xs text-slate-500"
                          onClick={cancelEditUpgrade}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={editUpgradeSaving}
                          className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
                        >
                          {editUpgradeSaving ? 'Saving…' : 'Save changes'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div
                      key={u.id}
                      className="flex items-start justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
                    >
                      <div>
                        <p className="font-medium">
                          {u.title ?? 'Upgrade'}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {u.upgrade_date
                            ? new Date(
                                u.upgrade_date
                              ).toLocaleDateString('en-GB', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })
                            : 'Date not set'}
                          {' · '}
                          {formatMoney(u.cost, 'GBP')}
                        </p>
                        {u.description && (
                          <p className="mt-1 text-[11px] text-slate-700">
                            {u.description}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        className="text-[11px] text-blue-600 underline"
                        onClick={() => startEditUpgrade(u)}
                      >
                        Edit
                      </button>
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          {/* Home Service History */}
          <div className="rounded border bg-white p-4 text-sm">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Home service history
              </p>
              <button
                type="button"
                className="text-xs text-blue-600 underline"
                onClick={() => {
                  setShowServiceForm(prev => !prev);
                  setServiceError(null);
                }}
              >
                {showServiceForm ? 'Cancel' : '+ Add service'}
              </button>
            </div>

            <p className="mb-2 text-[11px] text-slate-500">
              Log inspections and safety events: boiler services, chimney
              sweeps, electrical checks, alarms, warranties and other
              servicing that keeps the home safe and compliant.
            </p>

            {showServiceForm && (
              <form
                onSubmit={handleServiceSubmit}
                className="mb-3 space-y-2 rounded border border-slate-200 bg-slate-50 p-3"
              >
                <div className="grid gap-2 md:grid-cols-3">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium">
                      Date
                    </label>
                    <input
                      type="date"
                      value={serviceDate}
                      onChange={e => setServiceDate(e.target.value)}
                      className="w-full rounded border px-2 py-1 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium">
                      Provider
                    </label>
                    <input
                      type="text"
                      value={serviceProvider}
                      onChange={e =>
                        setServiceProvider(e.target.value)
                      }
                      className="w-full rounded border px-2 py-1 text-xs"
                      placeholder="e.g. British Gas, Local sweep"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium">
                      Cost (GBP)
                    </label>
                    <input
                      type="number"
                      value={serviceCost}
                      onChange={e => setServiceCost(e.target.value)}
                      className="w-full rounded border px-2 py-1 text-xs"
                      placeholder="e.g. 120"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-medium">
                    Description
                  </label>
                  <textarea
                    value={serviceDescription}
                    onChange={e =>
                      setServiceDescription(e.target.value)
                    }
                    className="min-h-[48px] w-full rounded border px-2 py-1 text-xs"
                    placeholder="What was done, room/area, any notes for next time…"
                  />
                </div>

                {serviceError && (
                  <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700">
                    {serviceError}
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="text-xs text-slate-500"
                    onClick={() => {
                      setShowServiceForm(false);
                      setServiceError(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={serviceSaving}
                    className="rounded bg-black px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
                  >
                    {serviceSaving ? 'Saving…' : 'Save service'}
                  </button>
                </div>
              </form>
            )}

            {services.length === 0 ? (
              <p className="text-xs text-slate-600">
                Nothing logged yet. Start with boiler services, chimney,
                electrical checks and any recurring safety or compliance
                visits.
              </p>
            ) : (
              <div className="space-y-2">
                {services.map(s =>
                  editingServiceId === s.id ? (
                    <form
                      key={s.id}
                      onSubmit={handleServiceUpdate}
                      className="space-y-2 rounded border border-blue-200 bg-blue-50 p-3 text-xs"
                    >
                      <div className="grid gap-2 md:grid-cols-3">
                        <div className="space-y-1">
                          <label className="block text-[11px] font-medium">
                            Date
                          </label>
                          <input
                            type="date"
                            value={editServiceDate}
                            onChange={e =>
                              setEditServiceDate(e.target.value)
                            }
                            className="w-full rounded border px-2 py-1 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[11px] font-medium">
                            Provider
                          </label>
                          <input
                            type="text"
                            value={editServiceProvider}
                            onChange={e =>
                              setEditServiceProvider(e.target.value)
                            }
                            className="w-full rounded border px-2 py-1 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[11px] font-medium">
                            Cost (GBP)
                          </label>
                          <input
                            type="number"
                            value={editServiceCost}
                            onChange={e =>
                              setEditServiceCost(e.target.value)
                            }
                            className="w-full rounded border px-2 py-1 text-xs"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[11px] font-medium">
                          Description
                        </label>
                        <textarea
                          value={editServiceDescription}
                          onChange={e =>
                            setEditServiceDescription(e.target.value)
                          }
                          className="min-h-[48px] w-full rounded border px-2 py-1 text-xs"
                        />
                      </div>

                      {editServiceError && (
                        <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700">
                          {editServiceError}
                        </div>
                      )}

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="text-xs text-slate-500"
                          onClick={cancelEditService}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={editServiceSaving}
                          className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
                        >
                          {editServiceSaving ? 'Saving…' : 'Save changes'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div
                      key={s.id}
                      className="flex items-start justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
                    >
                      <div>
                        <p className="font-medium">
                          {s.provider ?? 'Service'}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {s.service_date
                            ? new Date(
                                s.service_date
                              ).toLocaleDateString('en-GB', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })
                            : 'Date not set'}
                          {' · '}
                          {formatMoney(s.cost, 'GBP')}
                        </p>
                        {s.description && (
                          <p className="mt-1 text-[11px] text-slate-700">
                            {s.description}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        className="text-[11px] text-blue-600 underline"
                        onClick={() => startEditService(s)}
                      >
                        Edit
                      </button>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Key documents (asset-level) */}
      <div className="rounded border bg-white p-4 text-sm">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Key documents (asset-level)
          </p>
          <button
            type="button"
            className="text-xs text-blue-600 underline"
            onClick={() => {
              setShowDocumentForm(prev => !prev);
              setDocError(null);
              setDocFile(null);
            }}
          >
            {showDocumentForm ? 'Cancel' : '+ Add document'}
          </button>
        </div>

        {showDocumentForm && (
          <form onSubmit={handleDocumentSubmit} className="mb-3 space-y-2">
            <div className="grid gap-2 md:grid-cols-3">
              <div className="space-y-1">
                <label className="block text-[11px] font-medium">
                  Type
                </label>
                <input
                  type="text"
                  value={docType}
                  onChange={e => setDocType(e.target.value)}
                  className="w-full rounded border px-2 py-1 text-xs"
                  placeholder="e.g. Survey, Certificate, Warranty"
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="block text-[11px] font-medium">
                  Title
                </label>
                <input
                  type="text"
                  value={docTitle}
                  onChange={e => setDocTitle(e.target.value)}
                  className="w-full rounded border px-2 py-1 text-xs"
                  placeholder="e.g. Homebuyer survey (2024)"
                />
              </div>
            </div>

            {/* Drag & drop + file input */}
            <div className="space-y-1">
              <label className="block text-[11px] font-medium">
                File or URL
              </label>
              <div
                className={`rounded border px-3 py-2 text-[11px] ${
                  docDragOver
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-dashed border-slate-300 bg-slate-50'
                }`}
                onDragOver={e => {
                  e.preventDefault();
                  setDocDragOver(true);
                }}
                onDragLeave={e => {
                  e.preventDefault();
                  setDocDragOver(false);
                }}
                onDrop={e => {
                  e.preventDefault();
                  setDocDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) {
                    setDocFile(file);
                  }
                }}
              >
                <p className="mb-1">
                  Drag & drop a file here, or choose from your computer.
                </p>
                <input
                  type="file"
                  onChange={e =>
                    setDocFile(e.target.files?.[0] ?? null)
                  }
                  className="text-[11px]"
                />
                {docFile && (
                  <p className="mt-1 text-[11px] text-slate-600">
                    Selected: {docFile.name}
                  </p>
                )}
              </div>
              <p className="text-[10px] text-slate-500">
                Alternatively, paste a link:
              </p>
              <input
                type="url"
                value={docUrl}
                onChange={e => setDocUrl(e.target.value)}
                className="w-full rounded border px-2 py-1 text-xs"
                placeholder="https://…"
              />
            </div>

            {docError && (
              <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700">
                {docError}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="text-xs text-slate-500"
                onClick={() => {
                  setShowDocumentForm(false);
                  setDocError(null);
                  setDocFile(null);
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={docSaving}
                className="rounded bg-black px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
              >
                {docSaving ? 'Saving…' : 'Save document'}
              </button>
            </div>
          </form>
        )}

        {assetDocuments.length === 0 ? (
          <p className="text-xs text-slate-600">
            Use this space to link important documents such as surveys, title
            docs, guarantees, safety certificates or manuals that apply to
            the whole asset.
          </p>
        ) : (
          <ul className="space-y-2 text-xs text-slate-700">
            {assetDocuments.map(d => (
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
                      {new Date(d.uploaded_at).toLocaleDateString(
                        'en-GB',
                        {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        }
                      )}
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
