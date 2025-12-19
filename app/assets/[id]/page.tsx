'use client';

import React, {
  useEffect,
  useState,
  ChangeEvent,
  DragEvent,
} from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

// Loosely typed rows to stay resilient while schema is still evolving
type Asset = any;
type Upgrade = any;
type Service = any;
type AssetDocument = any;

type IdentityLevel = 'unknown' | 'basic' | 'good' | 'strong';

type Valuation = {
  id: string;
  valuation_source: string | null;
  suggested_value: number | null;
  currency: string | null;
  created_at: string;
};

function getCategoryName(asset: Asset | null): string | null {
  if (!asset) return null;
  const cat = asset.category;
  if (!cat) return null;

  if (Array.isArray(cat)) {
    if (!cat[0]) return null;
    return cat[0].name ?? null;
  }
  return cat.name ?? null;
}

function isHomeCategoryName(name: string | null | undefined): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  const keywords = ['home', 'house', 'property', 'flat', 'apartment', 'real estate'];
  return keywords.some((k) => lower.includes(k));
}

function formatMoney(
  value: number | null | undefined,
  currency: string | null | undefined
): string {
  if (value == null) return '—';
  const cur = currency || 'GBP';
  const symbol =
    cur === 'GBP'
      ? '£'
      : cur === 'EUR'
      ? '€'
      : cur === 'USD'
      ? '$'
      : cur + ' ';
  return `${symbol}${value.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString();
  } catch {
    return dateStr;
  }
}

function computeIdentityLevel(asset: Asset): IdentityLevel {
  const categoryName = getCategoryName(asset);
  const isHome = isHomeCategoryName(categoryName);
  const hasTitle = !!asset.title;
  const hasCity = !!asset.city;
  const hasCountry = !!asset.country;
  const hasBrandOrModel = !!asset.brand || !!asset.model_name;
  const hasSerial = !!asset.serial_number;
  const hasUrl = !!asset.purchase_url;

  if (isHome) {
    const hasFullAddress = hasTitle && hasCity && hasCountry;
    const url = (asset.purchase_url || '').toLowerCase();
    const isPropUrl = url.includes('zoopla.') || url.includes('rightmove.');
    if (hasFullAddress && isPropUrl) return 'strong';
    if (hasFullAddress || isPropUrl) return 'good';
    if (hasTitle || hasCity || hasCountry) return 'basic';
    return 'unknown';
  }

  if (!hasTitle && !hasBrandOrModel) return 'unknown';
  if (hasBrandOrModel && categoryName && (hasSerial || hasUrl)) return 'strong';
  if (hasBrandOrModel && categoryName) return 'good';
  if (hasTitle) return 'basic';
  return 'unknown';
}

function computeRoundReady(asset: Asset): {
  ready: boolean;
  statusLabel: string;
  explanation: string;
} {
  const identity = computeIdentityLevel(asset);
  const hasContext =
    !!asset.purchase_url || !!asset.notes_internal || !!asset.receipt_url;

  const categoryName = getCategoryName(asset);
  const isHome = isHomeCategoryName(categoryName);
  const hasFullAddress = !!asset.title && !!asset.city && !!asset.country;
  const url = (asset.purchase_url || '').toLowerCase();
  const isPropUrl = url.includes('zoopla.') || url.includes('rightmove.');

  if (isHome) {
    if (hasFullAddress && isPropUrl && hasContext) {
      return {
        ready: true,
        statusLabel: 'Round Ready',
        explanation:
          'Full address and property listing link available – Round can confidently match this home against market data.',
      };
    }
    if (hasFullAddress || isPropUrl) {
      return {
        ready: false,
        statusLabel: 'Almost Round Ready',
        explanation:
          'Round knows the property fairly well. Add the Zoopla/Rightmove link and a key document (survey or valuation) to fully unlock comparisons.',
      };
    }
    return {
      ready: false,
      statusLabel: 'Needs more detail',
      explanation:
        'Add the full address and, ideally, a Zoopla or Rightmove link so Round clearly understands which home this is.',
    };
  }

  if (identity === 'strong' && hasContext) {
    return {
      ready: true,
      statusLabel: 'Round Ready',
      explanation:
        'Identity and context are strong – Round can meaningfully compare this asset against similar items.',
    };
  }

  if (identity === 'good') {
    return {
      ready: false,
      statusLabel: 'Almost Round Ready',
      explanation:
        'Brand/model and category are solid, but add a receipt, URL or notes so Round has more context.',
    };
  }

  return {
    ready: false,
    statusLabel: 'Needs more detail',
    explanation:
      'Give this asset a clearer identity (brand/model or full description) and at least one supporting document or link.',
  };
}

export default function AssetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const assetId = params?.id as string;

  const [asset, setAsset] = useState<Asset | null>(null);
  const [upgrades, setUpgrades] = useState<Upgrade[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [documents, setDocuments] = useState<AssetDocument[]>([]);
  const [valuations, setValuations] = useState<Valuation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add-upgrade form
  const [upgradeTitle, setUpgradeTitle] = useState('');
  const [upgradeDescription, setUpgradeDescription] = useState('');
  const [upgradeDate, setUpgradeDate] = useState('');
  const [upgradeCost, setUpgradeCost] = useState('');
  const [upgradeCurrency, setUpgradeCurrency] = useState('GBP');
  const [upgradeProvider, setUpgradeProvider] = useState('');
  const [savingUpgrade, setSavingUpgrade] = useState(false);
  const [showAddUpgradeForm, setShowAddUpgradeForm] = useState(false);

  // Document attached while creating an upgrade
  const [newUpgradeDocFile, setNewUpgradeDocFile] = useState<File | null>(null);
  const [newUpgradeDocNotes, setNewUpgradeDocNotes] = useState('');

  // Edit-upgrade form
  const [editingUpgradeId, setEditingUpgradeId] = useState<string | null>(null);
  const [editUpgradeTitle, setEditUpgradeTitle] = useState('');
  const [editUpgradeDescription, setEditUpgradeDescription] = useState('');
  const [editUpgradeDate, setEditUpgradeDate] = useState('');
  const [editUpgradeCost, setEditUpgradeCost] = useState('');
  const [editUpgradeCurrency, setEditUpgradeCurrency] = useState('GBP');
  const [editUpgradeProvider, setEditUpgradeProvider] = useState('');
  const [savingUpgradeEdit, setSavingUpgradeEdit] = useState(false);

  // Add-service form
  const [serviceType, setServiceType] = useState('');
  const [serviceDescription, setServiceDescription] = useState('');
  const [serviceDate, setServiceDate] = useState('');
  const [serviceCost, setServiceCost] = useState('');
  const [serviceCurrency, setServiceCurrency] = useState('GBP');
  const [serviceProvider, setServiceProvider] = useState('');
  const [savingService, setSavingService] = useState(false);
  const [showAddServiceForm, setShowAddServiceForm] = useState(false);

  // Asset-level doc upload
  const [assetDocFile, setAssetDocFile] = useState<File | null>(null);
  const [assetDocNotes, setAssetDocNotes] = useState('');
  const [savingAssetDoc, setSavingAssetDoc] = useState(false);
  const [showAddAssetDocForm, setShowAddAssetDocForm] = useState(false);

  // Upgrade-level doc upload (existing upgrades)
  const [upgradeDocFile, setUpgradeDocFile] = useState<File | null>(null);
  const [upgradeDocNotes, setUpgradeDocNotes] = useState('');
  const [upgradeDocTargetId, setUpgradeDocTargetId] = useState<string | null>(null);
  const [savingUpgradeDoc, setSavingUpgradeDoc] = useState(false);

  // Service-level doc upload (existing services)
  const [serviceDocFile, setServiceDocFile] = useState<File | null>(null);
  const [serviceDocNotes, setServiceDocNotes] = useState('');
  const [serviceDocTargetId, setServiceDocTargetId] = useState<string | null>(null);
  const [savingServiceDoc, setSavingServiceDoc] = useState(false);

  useEffect(() => {
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

      try {
        // Main asset
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
            purchase_date,
            current_estimated_value,
            estimate_currency,
            purchase_url,
            receipt_url,
            notes_internal,
            city,
            country,
            category_id,
            category:categories ( id, name )
          `
          )
          .eq('id', assetId)
          .eq('owner_id', user.id)
          .maybeSingle();

        if (assetError) {
          console.error(assetError);
          setError('Could not load this asset.');
          setLoading(false);
          return;
        }

        if (!assetData) {
          setError('This asset could not be found. It may have been deleted.');
          setLoading(false);
          return;
        }

        setAsset(assetData as Asset);

        // Upgrades
        const { data: upgradesData } = await supabase
          .from('asset_upgrades')
          .select('*')
          .eq('asset_id', assetId)
          .order('performed_date', { ascending: false });

        if (upgradesData) setUpgrades(upgradesData as Upgrade[]);

        // Services
        const { data: servicesData } = await supabase
          .from('asset_services')
          .select('*')
          .eq('asset_id', assetId)
          .order('performed_date', { ascending: false });

        if (servicesData) setServices(servicesData as Service[]);

        // Documents
        const { data: docsData } = await supabase
          .from('asset_documents')
          .select('*')
          .eq('asset_id', assetId)
          .order('uploaded_at', { ascending: false });

        if (docsData) setDocuments(docsData as AssetDocument[]);

        // Valuations
        const { data: valuationsData } = await supabase
          .from('valuations')
          .select(
            `
            id,
            valuation_source,
            suggested_value,
            currency,
            created_at
          `
          )
          .eq('asset_id', assetId)
          .order('created_at', { ascending: false });

        if (valuationsData) setValuations(valuationsData as Valuation[]);
      } catch (err) {
        console.error(err);
        setError('Something went wrong loading this asset.');
      } finally {
        setLoading(false);
      }
    };

    if (assetId) {
      load();
    }
  }, [assetId, router]);

  // Shared document helpers

  const uploadFileToBucket = async (
    file: File,
    userId: string,
    assetId: string
  ): Promise<string | null> => {
    const bucket = 'documents';
    const safeName = file.name.replace(/[^\w.\-]+/g, '_');
    const path = `${userId}/${assetId}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, file);

    if (uploadError) {
      console.error(uploadError);
      setError('Could not upload document.');
      return null;
    }

    const { data: publicUrlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(path);
    return publicUrlData?.publicUrl ?? null;
  };

  const handleDeleteDocument = async (docId: string) => {
    setError(null);
    try {
      const { error } = await supabase
        .from('asset_documents')
        .delete()
        .eq('id', docId);

      if (error) {
        console.error(error);
        setError('Could not delete document.');
        return;
      }

      setDocuments((prev) => prev.filter((d: AssetDocument) => d.id !== docId));
    } catch (err) {
      console.error(err);
      setError('Something went wrong deleting the document.');
    }
  };

  // Upgrades – new upgrade form

  const handleNewUpgradeDocFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setNewUpgradeDocFile(file);
  };

  const handleNewUpgradeDocDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) setNewUpgradeDocFile(file);
  };

  const handleNewUpgradeDocDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleAddUpgrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!asset) return;
    if (!upgradeTitle.trim()) return;

    setSavingUpgrade(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      const costNumber =
        upgradeCost.trim() === '' ? null : Number(upgradeCost);

      const { data, error } = await supabase
        .from('asset_upgrades')
        .insert({
          asset_id: asset.id,
          owner_id: user.id,
          title: upgradeTitle || null,
          description: upgradeDescription || null,
          cost_amount: costNumber,
          cost_currency: upgradeCurrency || 'GBP',
          performed_date: upgradeDate || null,
          provider_name: upgradeProvider || null,
        })
        .select('*')
        .maybeSingle();

      if (error) {
        console.error(error);
        setError(error.message || 'Could not save upgrade.');
        setSavingUpgrade(false);
        return;
      }

      if (!data) {
        setError('Could not save upgrade.');
      } else {
        const insertedUpgrade = data as Upgrade;

        // Optional document attached at creation
        if (newUpgradeDocFile) {
          const fileUrl = await uploadFileToBucket(
            newUpgradeDocFile,
            user.id,
            asset.id
          );
          if (fileUrl) {
            const { data: docData, error: docError } = await supabase
              .from('asset_documents')
              .insert({
                asset_id: asset.id,
                owner_id: user.id,
                file_url: fileUrl,
                notes: newUpgradeDocNotes || null,
                upgrade_id: insertedUpgrade.id,
                service_id: null,
              })
              .select('*')
              .maybeSingle();

            if (docError) {
              console.error(docError);
              setError(docError.message || 'Could not save upgrade document.');
            } else if (docData) {
              setDocuments((prev) => [docData as AssetDocument, ...prev]);
            }
          }
        }

        setUpgrades((prev) => [insertedUpgrade, ...prev]);
      }

      // Reset form
      setUpgradeTitle('');
      setUpgradeDescription('');
      setUpgradeDate('');
      setUpgradeCost('');
      setUpgradeCurrency('GBP');
      setUpgradeProvider('');
      setNewUpgradeDocFile(null);
      setNewUpgradeDocNotes('');
      setShowAddUpgradeForm(false);
    } catch (err: any) {
      console.error(err);
      setError(
        typeof err?.message === 'string'
          ? err.message
          : 'Something went wrong saving the upgrade.'
      );
    } finally {
      setSavingUpgrade(false);
    }
  };

  // Edit upgrade

  const startEditUpgrade = (u: Upgrade) => {
    setEditingUpgradeId(u.id);
    setEditUpgradeTitle(u.title || '');
    setEditUpgradeDescription(u.description || '');
    setEditUpgradeDate(u.performed_date || '');
    setEditUpgradeCost(
      u.cost_amount != null ? String(u.cost_amount) : ''
    );
    setEditUpgradeCurrency(u.cost_currency || 'GBP');
    setEditUpgradeProvider(u.provider_name || '');
  };

  const cancelEditUpgrade = () => {
    setEditingUpgradeId(null);
    setEditUpgradeTitle('');
    setEditUpgradeDescription('');
    setEditUpgradeDate('');
    setEditUpgradeCost('');
    setEditUpgradeCurrency('GBP');
    setEditUpgradeProvider('');
  };

  const handleUpdateUpgrade = async (
    e: React.FormEvent,
    upgradeId: string
  ) => {
    e.preventDefault();
    if (!asset) return;
    if (!editUpgradeTitle.trim()) return;

    setSavingUpgradeEdit(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      const costNumber =
        editUpgradeCost.trim() === '' ? null : Number(editUpgradeCost);

      const { data, error } = await supabase
        .from('asset_upgrades')
        .update({
          title: editUpgradeTitle || null,
          description: editUpgradeDescription || null,
          performed_date: editUpgradeDate || null,
          cost_amount: costNumber,
          cost_currency: editUpgradeCurrency || 'GBP',
          provider_name: editUpgradeProvider || null,
        })
        .eq('id', upgradeId)
        .eq('asset_id', asset.id)
        .select('*'); // array of rows

      if (error) {
        console.error(error);
        setError(error.message || 'Could not update upgrade.');
        setSavingUpgradeEdit(false);
        return;
      }

      if (!data || data.length === 0) {
        setError('Could not update upgrade.');
        setSavingUpgradeEdit(false);
        return;
      }

      const updated = data[0] as Upgrade;

      setUpgrades((prev) =>
        prev.map((u: Upgrade) => (u.id === upgradeId ? updated : u))
      );
      cancelEditUpgrade();
    } catch (err: any) {
      console.error(err);
      setError(
        typeof err?.message === 'string'
          ? err.message
          : 'Something went wrong updating the upgrade.'
      );
    } finally {
      setSavingUpgradeEdit(false);
    }
  };

  const handleDeleteUpgrade = async (upgradeId: string) => {
    if (!asset) return;
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      // Delete related documents first
      const { error: docsError } = await supabase
        .from('asset_documents')
        .delete()
        .eq('upgrade_id', upgradeId);

      if (docsError) {
        console.error(docsError);
        setError(
          docsError.message ||
            'Could not delete related documents for this upgrade.'
        );
      }

      const { error: upgradeError } = await supabase
        .from('asset_upgrades')
        .delete()
        .eq('id', upgradeId)
        .eq('asset_id', asset.id)
        .eq('owner_id', user.id);

      if (upgradeError) {
        console.error(upgradeError);
        setError(upgradeError.message || 'Could not delete upgrade.');
        return;
      }

      setUpgrades((prev) =>
        prev.filter((u: Upgrade) => u.id !== upgradeId)
      );
      setDocuments((prev) =>
        prev.filter((d: AssetDocument) => d.upgrade_id !== upgradeId)
      );
      if (editingUpgradeId === upgradeId) {
        cancelEditUpgrade();
      }
    } catch (err: any) {
      console.error(err);
      setError(
        typeof err?.message === 'string'
          ? err.message
          : 'Something went wrong deleting the upgrade.'
      );
    }
  };

  // Services

  const handleAddService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!asset) return;
    if (!serviceType.trim()) return;

    setSavingService(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      const costNumber =
        serviceCost.trim() === '' ? null : Number(serviceCost);

      const { data, error } = await supabase
        .from('asset_services')
        .insert({
          asset_id: asset.id,
          owner_id: user.id,
          service_type: serviceType || null,
          description: serviceDescription || null,
          cost_amount: costNumber,
          cost_currency: serviceCurrency || 'GBP',
          performed_date: serviceDate || null,
          provider_name: serviceProvider || null,
        })
        .select('*')
        .maybeSingle();

      if (error) {
        console.error(error);
        setError(error.message || 'Could not save service.');
        setSavingService(false);
        return;
      }

      if (!data) {
        setError('Could not save service.');
      } else {
        setServices((prev) => [data as Service, ...prev]);
      }

      setServiceType('');
      setServiceDescription('');
      setServiceDate('');
      setServiceCost('');
      setServiceCurrency('GBP');
      setServiceProvider('');
      setShowAddServiceForm(false);
    } catch (err: any) {
      console.error(err);
      setError(
        typeof err?.message === 'string'
          ? err.message
          : 'Something went wrong saving the service.'
      );
    } finally {
      setSavingService(false);
    }
  };

  // Asset-level docs

  const handleAssetDocFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setAssetDocFile(file);
  };

  const handleAssetDocDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) setAssetDocFile(file);
  };

  const handleAssetDocDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleAddAssetDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!asset || !assetDocFile) return;

    setSavingAssetDoc(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const fileUrl = await uploadFileToBucket(
        assetDocFile,
        user.id,
        asset.id
      );
      if (!fileUrl) {
        setSavingAssetDoc(false);
        return;
      }

      const { data, error } = await supabase
        .from('asset_documents')
        .insert({
          asset_id: asset.id,
          owner_id: user.id,
          file_url: fileUrl,
          notes: assetDocNotes || null,
          upgrade_id: null,
          service_id: null,
        })
        .select('*')
        .maybeSingle();

      if (error) {
        console.error(error);
        setError(error.message || 'Could not save document.');
        setSavingAssetDoc(false);
        return;
      }

      if (!data) {
        setError('Could not save document.');
        setSavingAssetDoc(false);
        return;
      }

      setDocuments((prev) => [data as AssetDocument, ...prev]);
      setAssetDocFile(null);
      setAssetDocNotes('');
      setShowAddAssetDocForm(false);
    } catch (err: any) {
      console.error(err);
      setError(
        typeof err?.message === 'string'
          ? err.message
          : 'Something went wrong saving the document.'
      );
    } finally {
      setSavingAssetDoc(false);
    }
  };

  // Upgrade-level docs (existing upgrades)

  const handleUpgradeDocFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setUpgradeDocFile(file);
  };

  const handleUpgradeDocDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) setUpgradeDocFile(file);
  };

  const handleUpgradeDocDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleAddUpgradeDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!asset || !upgradeDocFile || !upgradeDocTargetId) return;

    setSavingUpgradeDoc(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const fileUrl = await uploadFileToBucket(
        upgradeDocFile,
        user.id,
        asset.id
      );
      if (!fileUrl) {
        setSavingUpgradeDoc(false);
        return;
      }

      const { data, error } = await supabase
        .from('asset_documents')
        .insert({
          asset_id: asset.id,
          owner_id: user.id,
          file_url: fileUrl,
          notes: upgradeDocNotes || null,
          upgrade_id: upgradeDocTargetId,
          service_id: null,
        })
        .select('*')
        .maybeSingle();

      if (error) {
        console.error(error);
        setError(error.message || 'Could not save document.');
        setSavingUpgradeDoc(false);
        return;
      }

      if (!data) {
        setError('Could not save document.');
        setSavingUpgradeDoc(false);
        return;
      }

      setDocuments((prev) => [data as AssetDocument, ...prev]);
      setUpgradeDocFile(null);
      setUpgradeDocNotes('');
      setUpgradeDocTargetId(null);
    } catch (err: any) {
      console.error(err);
      setError(
        typeof err?.message === 'string'
          ? err.message
          : 'Something went wrong saving the document.'
      );
    } finally {
      setSavingUpgradeDoc(false);
    }
  };

  // Service-level docs (existing services)

  const handleServiceDocFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setServiceDocFile(file);
  };

  const handleServiceDocDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) setServiceDocFile(file);
  };

  const handleServiceDocDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleAddServiceDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!asset || !serviceDocFile || !serviceDocTargetId) return;

    setSavingServiceDoc(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const fileUrl = await uploadFileToBucket(
        serviceDocFile,
        user.id,
        asset.id
      );
      if (!fileUrl) {
        setSavingServiceDoc(false);
        return;
      }

      const { data, error } = await supabase
        .from('asset_documents')
        .insert({
          asset_id: asset.id,
          owner_id: user.id,
          file_url: fileUrl,
          notes: serviceDocNotes || null,
          upgrade_id: null,
          service_id: serviceDocTargetId,
        })
        .select('*')
        .maybeSingle();

      if (error) {
        console.error(error);
        setError(error.message || 'Could not save document.');
        setSavingServiceDoc(false);
        return;
      }

      if (!data) {
        setError('Could not save document.');
        setSavingServiceDoc(false);
        return;
      }

      setDocuments((prev) => [data as AssetDocument, ...prev]);
      setServiceDocFile(null);
      setServiceDocNotes('');
      setServiceDocTargetId(null);
    } catch (err: any) {
      console.error(err);
      setError(
        typeof err?.message === 'string'
          ? err.message
          : 'Something went wrong saving the document.'
      );
    } finally {
      setSavingServiceDoc(false);
    }
  };

  // Render guards

  if (loading) {
    return <div className="p-6">Loading asset…</div>;
  }

  if (!asset) {
    return (
      <div className="p-6">
        <p className="mb-2 text-sm text-red-600">Could not find this asset.</p>
        <button
          className="rounded border px-3 py-1.5 text-sm"
          onClick={() => router.push('/dashboard')}
        >
          Back to portfolio
        </button>
      </div>
    );
  }

  const categoryName = getCategoryName(asset);
  const isHome = isHomeCategoryName(categoryName);
  const identityLevel = computeIdentityLevel(asset);
  const identityLabel =
    identityLevel === 'strong'
      ? 'Strong identity'
      : identityLevel === 'good'
      ? 'Good identity'
      : identityLevel === 'basic'
      ? 'Basic identity'
      : 'Identity unclear';

  const roundReady = computeRoundReady(asset);

  const assetLevelDocuments = documents.filter(
    (d: AssetDocument) => !d.upgrade_id && !d.service_id
  );

  const upgradeDocsById: Record<string, AssetDocument[]> = {};
  documents.forEach((d: AssetDocument) => {
    if (d.upgrade_id) {
      if (!upgradeDocsById[d.upgrade_id]) upgradeDocsById[d.upgrade_id] = [];
      upgradeDocsById[d.upgrade_id].push(d);
    }
  });

  const serviceDocsById: Record<string, AssetDocument[]> = {};
  documents.forEach((d: AssetDocument) => {
    if (d.service_id) {
      if (!serviceDocsById[d.service_id]) serviceDocsById[d.service_id] = [];
      serviceDocsById[d.service_id].push(d);
    }
  });

  return (
    <div className="space-y-4 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {asset.title || (isHome ? 'Home' : 'Untitled asset')}
          </h1>
          <p className="text-xs text-slate-500">
            {categoryName || 'No category'} ·{' '}
            {asset.status ? asset.status.replace('_', ' ') : 'status unknown'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="rounded border px-3 py-1.5 text-sm"
            onClick={() => router.push('/dashboard')}
          >
            Back to portfolio
          </button>
          <button
            className="rounded bg-black px-4 py-1.5 text-sm font-medium text-white"
            onClick={() => router.push(`/assets/${asset.id}/edit`)}
          >
            Edit asset
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Identity / Round readiness / Values */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2 rounded border bg-white p-4">
          <p className="text-xs font-semibold text-slate-600">Identity</p>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              identityLevel === 'strong'
                ? 'bg-emerald-100 text-emerald-800'
                : identityLevel === 'good'
                ? 'bg-sky-100 text-sky-800'
                : identityLevel === 'basic'
                ? 'bg-slate-100 text-slate-700'
                : 'bg-amber-100 text-amber-800'
            }`}
            title={identityLabel}
          >
            {identityLabel}
          </span>
          <p className="text-[11px] text-slate-500">
            Think of this as: does Round clearly know what this is?
          </p>
        </div>

        <div className="space-y-2 rounded border bg-white p-4">
          <p className="text-xs font-semibold text-slate-600">
            Round readiness
          </p>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              roundReady.ready
                ? 'bg-emerald-100 text-emerald-800'
                : roundReady.statusLabel === 'Almost Round Ready'
                ? 'bg-sky-100 text-sky-800'
                : 'bg-amber-100 text-amber-800'
            }`}
            title={roundReady.explanation}
          >
            {roundReady.statusLabel}
          </span>
          <p className="text-[11px] text-slate-500">
            Hover for hints on what else Round needs before it can do serious
            valuation work.
          </p>
        </div>

        <div className="space-y-2 rounded border bg-white p-4">
          <p className="text-xs font-semibold text-slate-600">
            Value snapshot
          </p>
          <p className="text-sm">
            Purchase:{' '}
            <span className="font-semibold">
              {formatMoney(asset.purchase_price, asset.purchase_currency)}
            </span>
          </p>
          <p className="text-sm">
            Current estimate:{' '}
            <span className="font-semibold">
              {formatMoney(
                asset.current_estimated_value,
                asset.estimate_currency || asset.purchase_currency
              )}
            </span>
          </p>
          <p className="text-[11px] text-slate-500">
            Manual for now; future Round will keep this live in the background.
          </p>
        </div>
      </div>

      {/* Details */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 rounded border bg-white p-4">
          <p className="text-xs font-semibold text-slate-600">
            {isHome ? 'Home details' : 'Asset details'}
          </p>

          {isHome ? (
            <>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Address / property</dt>
                  <dd className="text-right">
                    {asset.title || (
                      <span className="text-slate-400">Not set</span>
                    )}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">City</dt>
                  <dd className="text-right">
                    {asset.city || (
                      <span className="text-slate-400">Not set</span>
                    )}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Country</dt>
                  <dd className="text-right">
                    {asset.country || (
                      <span className="text-slate-400">Not set</span>
                    )}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-[11px] text-slate-500">
                Your home acts as a container for upgrades, services and key
                documents – like a digital service book.
              </p>
            </>
          ) : (
            <>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Brand</dt>
                  <dd className="text-right">
                    {asset.brand || (
                      <span className="text-slate-400">Not set</span>
                    )}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Model</dt>
                  <dd className="text-right">
                    {asset.model_name || (
                      <span className="text-slate-400">Not set</span>
                    )}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Serial / unique ID</dt>
                  <dd className="text-right">
                    {asset.serial_number || (
                      <span className="text-slate-400">Not set</span>
                    )}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-[11px] text-slate-500">
                Brand, model and serial give Round exact matches against
                catalogues and resale listings.
              </p>
            </>
          )}
        </div>

        <div className="space-y-2 rounded border bg-white p-4">
          <p className="text-xs font-semibold text-slate-600">
            Link & notes
          </p>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">
                {isHome ? 'Property URL' : 'Purchase URL'}
              </dt>
              <dd className="text-right break-all">
                {asset.purchase_url ? (
                  <a
                    href={asset.purchase_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-sky-700 underline"
                  >
                    {asset.purchase_url}
                  </a>
                ) : (
                  <span className="text-slate-400">Not set</span>
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Receipt</dt>
              <dd className="text-right">
                {asset.receipt_url ? (
                  <a
                    href={asset.receipt_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-sky-700 underline"
                  >
                    View receipt
                  </a>
                ) : (
                  <span className="text-slate-400">Not uploaded</span>
                )}
              </dd>
            </div>
          </dl>
          {asset.notes_internal && (
            <div className="mt-2 rounded bg-slate-50 p-2 text-xs text-slate-600">
              <p className="mb-1 font-medium text-slate-700">
                Notes for Round
              </p>
              <p className="whitespace-pre-wrap">
                {asset.notes_internal}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Upgrades & Improvements */}
      <div className="space-y-3 rounded border bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">
              Upgrades &amp; improvements
            </p>
            <p className="text-[11px] text-slate-500">
              New kitchen, refits, major improvements – anything that adds
              value.
            </p>
          </div>
          <button
            type="button"
            className="rounded bg-black px-3 py-1.5 text-xs font-medium text-white"
            onClick={() => setShowAddUpgradeForm((prev) => !prev)}
          >
            {showAddUpgradeForm ? 'Close form' : 'Add upgrade'}
          </button>
        </div>

        {upgrades.length === 0 ? (
          <p className="text-xs text-slate-500">
            No upgrades recorded yet.
          </p>
        ) : (
          <div className="space-y-2 text-sm">
            {upgrades.map((u: Upgrade) => {
              const docs = upgradeDocsById[u.id] || [];
              const isEditing = editingUpgradeId === u.id;
              const showDocForm = upgradeDocTargetId === u.id;

              return (
                <div
                  key={u.id}
                  className="space-y-2 rounded border bg-slate-50 p-3"
                >
                  {/* Read view */}
                  {!isEditing && (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">
                            {u.title || 'Upgrade'}
                          </p>
                          {u.description && (
                            <p className="text-xs text-slate-600">
                              {u.description}
                            </p>
                          )}
                          <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-slate-500">
                            <span>{formatDate(u.performed_date)}</span>
                            <span>
                              {formatMoney(
                                u.cost_amount,
                                u.cost_currency
                              )}
                            </span>
                            {u.provider_name && (
                              <span>by {u.provider_name}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 text-[11px]">
                          {docs.length > 0 && (
                            <span className="inline-flex items-center rounded-full bg-white px-2 py-0.5 text-[10px] text-slate-700">
                              📄 {docs.length} doc
                              {docs.length > 1 ? 's' : ''}
                            </span>
                          )}
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="text-sky-700 underline"
                              onClick={() => startEditUpgrade(u)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="text-red-600 underline"
                              onClick={() => handleDeleteUpgrade(u.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Documents list */}
                      {docs.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          {docs.map((d: AssetDocument) => (
                            <div
                              key={d.id}
                              className="flex items-center gap-2 rounded-full border bg-white px-2 py-1"
                            >
                              <span className="text-[11px]">📄</span>
                              <a
                                href={d.file_url}
                                target="_blank"
                                rel="noreferrer"
                                className="max-w-[160px] truncate text-[11px] text-sky-700 underline"
                              >
                                {d.notes || 'Document'}
                              </a>
                              <button
                                type="button"
                                onClick={() =>
                                  handleDeleteDocument(d.id)
                                }
                                className="text-[11px] text-red-600"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Compact attach-doc form toggle */}
                      <div className="mt-1">
                        {!showDocForm && (
                          <button
                            type="button"
                            className="text-[11px] text-sky-700 underline"
                            onClick={() => setUpgradeDocTargetId(u.id)}
                          >
                            Attach document
                          </button>
                        )}
                      </div>

                      {/* Compact attach-doc form */}
                      {showDocForm && (
                        <form
                          onSubmit={handleAddUpgradeDocument}
                          className="mt-2 flex flex-col gap-2 rounded border border-dashed border-slate-300 bg-slate-100 p-2 text-[11px]"
                        >
                          <div className="flex flex-col gap-2 md:flex-row">
                            <input
                              type="text"
                              value={upgradeDocNotes}
                              onChange={(e) =>
                                setUpgradeDocNotes(e.target.value)
                              }
                              placeholder="Label (invoice, completion cert...)"
                              className="w-full rounded border px-2 py-1.5"
                            />
                            <input
                              type="file"
                              accept="application/pdf,image/*"
                              onChange={handleUpgradeDocFileChange}
                              className="text-xs"
                            />
                          </div>
                          {upgradeDocFile && (
                            <p className="text-[11px] text-slate-700">
                              Selected: {upgradeDocFile.name}
                            </p>
                          )}
                          <div
                            onDragOver={handleUpgradeDocDragOver}
                            onDrop={handleUpgradeDocDrop}
                            className="rounded border border-dashed border-slate-300 bg-slate-50 px-2 py-1 text-center"
                          >
                            Drag &amp; drop file here (optional)
                          </div>
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              className="rounded border px-3 py-1.5"
                              onClick={() => {
                                setUpgradeDocTargetId(null);
                                setUpgradeDocFile(null);
                                setUpgradeDocNotes('');
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={
                                savingUpgradeDoc || !upgradeDocFile
                              }
                              className="rounded bg-black px-3 py-1.5 font-medium text-white disabled:bg-slate-500"
                            >
                              {savingUpgradeDoc ? 'Saving…' : 'Add'}
                            </button>
                          </div>
                        </form>
                      )}
                    </>
                  )}

                  {/* Inline edit form */}
                  {isEditing && (
                    <form
                      onSubmit={(e) => handleUpdateUpgrade(e, u.id)}
                      className="space-y-2 rounded border border-slate-300 bg-white p-2 text-[11px]"
                    >
                      <p className="font-medium text-slate-700">
                        Edit upgrade
                      </p>
                      <div className="grid gap-2 md:grid-cols-2">
                        <input
                          type="text"
                          value={editUpgradeTitle}
                          onChange={(e) =>
                            setEditUpgradeTitle(e.target.value)
                          }
                          required
                          placeholder="Title"
                          className="w-full rounded border px-2 py-1.5"
                        />
                        <input
                          type="text"
                          value={editUpgradeProvider}
                          onChange={(e) =>
                            setEditUpgradeProvider(e.target.value)
                          }
                          placeholder="Provider"
                          className="w-full rounded border px-2 py-1.5"
                        />
                      </div>
                      <div className="grid gap-2 md:grid-cols-3">
                        <input
                          type="date"
                          value={editUpgradeDate}
                          onChange={(e) =>
                            setEditUpgradeDate(e.target.value)
                          }
                          className="w-full rounded border px-2 py-1.5"
                        />
                        <input
                          type="number"
                          value={editUpgradeCost}
                          onChange={(e) =>
                            setEditUpgradeCost(e.target.value)
                          }
                          placeholder="Cost"
                          className="w-full rounded border px-2 py-1.5"
                        />
                        <input
                          type="text"
                          value={editUpgradeCurrency}
                          onChange={(e) =>
                            setEditUpgradeCurrency(e.target.value)
                          }
                          className="w-full rounded border px-2 py-1.5"
                        />
                      </div>
                      <textarea
                        value={editUpgradeDescription}
                        onChange={(e) =>
                          setEditUpgradeDescription(e.target.value)
                        }
                        rows={2}
                        placeholder="Description"
                        className="w-full rounded border px-2 py-1.5"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={cancelEditUpgrade}
                          className="rounded border px-3 py-1.5"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={savingUpgradeEdit}
                          className="rounded bg-black px-3 py-1.5 font-medium text-white disabled:bg-slate-500"
                        >
                          {savingUpgradeEdit ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Add upgrade form */}
        {showAddUpgradeForm && (
          <form
            onSubmit={handleAddUpgrade}
            className="mt-3 space-y-2 rounded border border-dashed border-slate-300 bg-slate-50 p-3 text-xs"
          >
            <p className="font-medium text-slate-700">Add an upgrade</p>
            <div className="grid gap-2 md:grid-cols-2">
              <input
                type="text"
                value={upgradeTitle}
                onChange={(e) => setUpgradeTitle(e.target.value)}
                required
                placeholder={
                  isHome
                    ? 'e.g. New kitchen, Corston switches'
                    : 'e.g. Reupholstery'
                }
                className="w-full rounded border px-2 py-1.5"
              />
              <input
                type="text"
                value={upgradeProvider}
                onChange={(e) => setUpgradeProvider(e.target.value)}
                placeholder="Provider (optional)"
                className="w-full rounded border px-2 py-1.5"
              />
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <input
                type="date"
                value={upgradeDate}
                onChange={(e) => setUpgradeDate(e.target.value)}
                className="w-full rounded border px-2 py-1.5"
              />
              <input
                type="number"
                value={upgradeCost}
                onChange={(e) => setUpgradeCost(e.target.value)}
                placeholder="Cost"
                className="w-full rounded border px-2 py-1.5"
              />
              <input
                type="text"
                value={upgradeCurrency}
                onChange={(e) => setUpgradeCurrency(e.target.value)}
                className="w-full rounded border px-2 py-1.5"
              />
            </div>
            <textarea
              value={upgradeDescription}
              onChange={(e) => setUpgradeDescription(e.target.value)}
              rows={2}
              placeholder="Scope of the upgrade"
              className="w-full rounded border px-2 py-1.5"
            />

            {/* Attach doc at creation */}
            <div className="mt-2 space-y-2 rounded border border-dashed border-slate-300 bg-slate-100 p-2">
              <div className="flex flex-col gap-2 md:flex-row">
                <input
                  type="text"
                  value={newUpgradeDocNotes}
                  onChange={(e) => setNewUpgradeDocNotes(e.target.value)}
                  placeholder="Label for document (optional)"
                  className="w-full rounded border px-2 py-1.5 text-[11px]"
                />
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={handleNewUpgradeDocFileChange}
                  className="text-[11px]"
                />
              </div>
              <div
                onDragOver={handleNewUpgradeDocDragOver}
                onDrop={handleNewUpgradeDocDrop}
                className="rounded border border-dashed border-slate-300 bg-slate-50 px-2 py-1 text-center text-[11px]"
              >
                Drag &amp; drop file here (optional)
              </div>
              {newUpgradeDocFile && (
                <p className="text-[11px] text-slate-700">
                  Selected: {newUpgradeDocFile.name}
                </p>
              )}
            </div>

            <div className="mt-2 flex justify-end">
              <button
                type="submit"
                disabled={savingUpgrade}
                className="rounded bg-black px-3 py-1.5 text-xs font-medium text-white disabled:bg-slate-500"
              >
                {savingUpgrade ? 'Saving…' : 'Add upgrade'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Home service history */}
      <div className="space-y-3 rounded border bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">
              Home service history
            </p>
            <p className="text-[11px] text-slate-500">
              Boiler service, chimney sweep, electrical checks – like a car
              service book for your home.
            </p>
          </div>
          <button
            type="button"
            className="rounded bg-black px-3 py-1.5 text-xs font-medium text-white"
            onClick={() => setShowAddServiceForm((prev) => !prev)}
          >
            {showAddServiceForm ? 'Close form' : 'Add service'}
          </button>
        </div>

        {services.length === 0 ? (
          <p className="text-xs text-slate-500">
            No services recorded yet.
          </p>
        ) : (
          <div className="space-y-2 text-sm">
            {services.map((s: Service) => {
              const docs = serviceDocsById[s.id] || [];
              const showDocForm = serviceDocTargetId === s.id;

              return (
                <div
                  key={s.id}
                  className="space-y-2 rounded border bg-slate-50 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">
                        {s.service_type || 'Service'}
                      </p>
                      {s.description && (
                        <p className="text-xs text-slate-600">
                          {s.description}
                        </p>
                      )}
                      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-slate-500">
                        <span>{formatDate(s.performed_date)}</span>
                        <span>
                          {formatMoney(
                            s.cost_amount,
                            s.cost_currency
                          )}
                        </span>
                        {s.provider_name && (
                          <span>by {s.provider_name}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-[11px]">
                      {docs.length > 0 && (
                        <span className="inline-flex items-center rounded-full bg-white px-2 py-0.5 text-[10px] text-slate-700">
                          📄 {docs.length} doc
                          {docs.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Documents */}
                  {docs.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      {docs.map((d: AssetDocument) => (
                        <div
                          key={d.id}
                          className="flex items-center gap-2 rounded-full border bg-white px-2 py-1"
                        >
                          <span className="text-[11px]">📄</span>
                          <a
                            href={d.file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="max-w-[160px] truncate text-[11px] text-sky-700 underline"
                          >
                            {d.notes || 'Document'}
                          </a>
                          <button
                            type="button"
                            onClick={() => handleDeleteDocument(d.id)}
                            className="text-[11px] text-red-600"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Compact attach-doc form toggle */}
                  <div className="mt-1">
                    {!showDocForm && (
                      <button
                        type="button"
                        className="text-[11px] text-sky-700 underline"
                        onClick={() => setServiceDocTargetId(s.id)}
                      >
                        Attach document
                      </button>
                    )}
                  </div>

                  {/* Compact attach-doc form */}
                  {showDocForm && (
                    <form
                      onSubmit={handleAddServiceDocument}
                      className="mt-2 flex flex-col gap-2 rounded border border-dashed border-slate-300 bg-slate-100 p-2 text-[11px]"
                    >
                      <div className="flex flex-col gap-2 md:flex-row">
                        <input
                          type="text"
                          value={serviceDocNotes}
                          onChange={(e) =>
                            setServiceDocNotes(e.target.value)
                          }
                          placeholder="Label for document"
                          className="w-full rounded border px-2 py-1.5"
                        />
                        <input
                          type="file"
                          accept="application/pdf,image/*"
                          onChange={handleServiceDocFileChange}
                          className="text-xs"
                        />
                      </div>
                      {serviceDocFile && (
                        <p className="text-[11px] text-slate-700">
                          Selected: {serviceDocFile.name}
                        </p>
                      )}
                      <div
                        onDragOver={handleServiceDocDragOver}
                        onDrop={handleServiceDocDrop}
                        className="rounded border border-dashed border-slate-300 bg-slate-50 px-2 py-1 text-center"
                      >
                        Drag &amp; drop file here (optional)
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="rounded border px-3 py-1.5"
                          onClick={() => {
                            setServiceDocTargetId(null);
                            setServiceDocFile(null);
                            setServiceDocNotes('');
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={
                            savingServiceDoc || !serviceDocFile
                          }
                          className="rounded bg-black px-3 py-1.5 font-medium text-white disabled:bg-slate-500"
                        >
                          {savingServiceDoc ? 'Saving…' : 'Add'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Add service form */}
        {showAddServiceForm && (
          <form
            onSubmit={handleAddService}
            className="mt-3 space-y-2 rounded border border-dashed border-slate-300 bg-slate-50 p-3 text-xs"
          >
            <p className="font-medium text-slate-700">Add a service</p>
            <div className="grid gap-2 md:grid-cols-2">
              <input
                type="text"
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value)}
                required
                placeholder="e.g. Boiler service"
                className="w-full rounded border px-2 py-1.5"
              />
              <input
                type="text"
                value={serviceProvider}
                onChange={(e) => setServiceProvider(e.target.value)}
                placeholder="Provider (optional)"
                className="w-full rounded border px-2 py-1.5"
              />
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <input
                type="date"
                value={serviceDate}
                onChange={(e) => setServiceDate(e.target.value)}
                className="w-full rounded border px-2 py-1.5"
              />
              <input
                type="number"
                value={serviceCost}
                onChange={(e) => setServiceCost(e.target.value)}
                placeholder="Cost"
                className="w-full rounded border px-2 py-1.5"
              />
              <input
                type="text"
                value={serviceCurrency}
                onChange={(e) => setServiceCurrency(e.target.value)}
                className="w-full rounded border px-2 py-1.5"
              />
            </div>
            <textarea
              value={serviceDescription}
              onChange={(e) => setServiceDescription(e.target.value)}
              rows={2}
              placeholder="What was done?"
              className="w-full rounded border px-2 py-1.5"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingService}
                className="rounded bg-black px-3 py-1.5 text-xs font-medium text-white disabled:bg-slate-500"
              >
                {savingService ? 'Saving…' : 'Add service'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Asset-level Key documents */}
      <div className="space-y-3 rounded border bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Key documents</p>
            <p className="text-[11px] text-slate-500">
              Surveys, certificates, valuations – anything that underpins
              value.
            </p>
          </div>
          <button
            type="button"
            className="rounded bg-black px-3 py-1.5 text-xs font-medium text-white"
            onClick={() => setShowAddAssetDocForm((prev) => !prev)}
          >
            {showAddAssetDocForm ? 'Close form' : 'Add document'}
          </button>
        </div>

        {assetLevelDocuments.length === 0 ? (
          <p className="text-xs text-slate-500">
            No documents uploaded yet.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2 text-sm">
            {assetLevelDocuments.map((d: AssetDocument) => (
              <div
                key={d.id}
                className="flex items-center gap-2 rounded-full border bg-slate-50 px-3 py-1"
              >
                <span className="text-xs">📄</span>
                <div className="flex flex-col">
                  <a
                    href={d.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="max-w-[160px] truncate text-xs text-sky-700 underline"
                  >
                    {d.notes || 'Document'}
                  </a>
                  <span className="text-[10px] text-slate-500">
                    {formatDate(d.uploaded_at)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteDocument(d.id)}
                  className="text-[11px] text-red-600"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add asset-level document */}
        {showAddAssetDocForm && (
          <form
            onSubmit={handleAddAssetDocument}
            className="mt-3 space-y-2 rounded border border-dashed border-slate-300 bg-slate-50 p-3 text-xs"
          >
            <p className="font-medium text-slate-700">Add a document</p>
            <input
              type="text"
              value={assetDocNotes}
              onChange={(e) => setAssetDocNotes(e.target.value)}
              placeholder="Label (e.g. Home survey)"
              className="w-full rounded border px-2 py-1.5"
            />
            <div
              onDragOver={handleAssetDocDragOver}
              onDrop={handleAssetDocDrop}
              className="flex flex-col items-center justify-center rounded border border-dashed border-slate-300 bg-slate-100 p-3 text-center"
            >
              <p>Drag &amp; drop PDF or image here</p>
              <p className="text-[11px] text-slate-500">
                or click to choose
              </p>
              <input
                type="file"
                accept="application/pdf,image/*"
                className="mt-2 text-xs"
                onChange={handleAssetDocFileChange}
              />
              {assetDocFile && (
                <p className="mt-2 text-[11px] text-slate-700">
                  Selected: {assetDocFile.name}
                </p>
              )}
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingAssetDoc || !assetDocFile}
                className="rounded bg-black px-3 py-1.5 text-xs font-medium text-white disabled:bg-slate-500"
              >
                {savingAssetDoc ? 'Saving…' : 'Add document'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Valuation history */}
      {valuations.length > 0 && (
        <div className="space-y-3 rounded border bg-white p-4">
          <p className="text-sm font-semibold">
            Valuation history
          </p>
          <p className="text-[11px] text-slate-500">
            Early experiments in how Round might track and explain value
            changes over time.
          </p>
          <ul className="mt-2 space-y-2 text-sm">
            {valuations.map((v) => (
              <li
                key={v.id}
                className="flex items-center justify-between rounded border bg-slate-50 p-2"
              >
                <div>
                  <p className="font-medium">
                    {v.valuation_source || 'Valuation'}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {formatDate(v.created_at)}
                  </p>
                </div>
                <div className="text-right text-sm">
                  {formatMoney(v.suggested_value, v.currency)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
