'use client';

import { useEffect, useState, ChangeEvent } from 'react';
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
  category_id: string | null;
  asset_type_id: string | null;
  category?: {
    name: string | null;
  } | null;
};

type IdentityLevel = 'unknown' | 'basic' | 'good' | 'strong';

function getCategoryName(asset: Asset): string {
  if (!asset.category) return '—';
  return asset.category.name ?? '—';
}

function isHomeCategory(asset: Asset): boolean {
  const categoryName = getCategoryName(asset);
  const lower = categoryName.toLowerCase();
  const homeKeywords = [
    'home',
    'house',
    'property',
    'flat',
    'apartment',
    'real estate',
  ];
  return homeKeywords.some((word) => lower.includes(word));
}

function computeIdentity(
  asset: Asset
): {
  level: IdentityLevel;
  shortLabel: string;
  tooltip: string;
  colorClass: string;
} {
  const categoryName = getCategoryName(asset);
  const isHome = isHomeCategory(asset);

  const purchaseUrl = asset.purchase_url || '';
  const hasZooplaOrRightmove =
    purchaseUrl.includes('zoopla.') ||
    purchaseUrl.includes('rightmove.');

  if (isHome) {
    const hasTitle = !!asset.title;
    const hasCity = !!asset.city;
    const hasCountry = !!asset.country;
    const hasFullAddress = hasTitle && hasCity && hasCountry;

    if (hasFullAddress && hasZooplaOrRightmove) {
      return {
        level: 'strong',
        shortLabel: 'Strong',
        tooltip:
          'Identity: Strong – full address and a Zoopla/Rightmove link give Round a very precise handle on this home.',
        colorClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      };
    }

    if (hasFullAddress || hasZooplaOrRightmove) {
      return {
        level: 'good',
        shortLabel: 'Good',
        tooltip:
          'Identity: Good – we have either the full address or a property portal link. Add both for the best match.',
        colorClass: 'bg-blue-100 text-blue-800 border-blue-200',
      };
    }

    if (hasTitle) {
      return {
        level: 'basic',
        shortLabel: 'Basic',
        tooltip:
          'Identity: Basic – we know roughly what the home is, but a full address and property link will help Round a lot.',
        colorClass: 'bg-amber-100 text-amber-800 border-amber-200',
      };
    }

    return {
      level: 'unknown',
      shortLabel: 'Unknown',
      tooltip:
        'Identity: Unknown – add at least an address or a property portal link.',
      colorClass: 'bg-slate-100 text-slate-700 border-slate-200',
    };
  }

  // Default (non-home) identity logic
  const hasCategory =
    !!categoryName && categoryName !== '—';
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
      shortLabel: 'Strong',
      tooltip:
        'Identity: Strong – brand, model, category and/or unique ID are clearly defined.',
      colorClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    };
  }

  if (score === 2) {
    return {
      level: 'good',
      shortLabel: 'Good',
      tooltip:
        'Identity: Good – at least two of brand, model and category are known.',
      colorClass: 'bg-blue-100 text-blue-800 border-blue-200',
    };
  }

  if (score === 1) {
    return {
      level: 'basic',
      shortLabel: 'Basic',
      tooltip:
        'Identity: Basic – Round has one signal, but would benefit from brand/model/category.',
      colorClass: 'bg-amber-100 text-amber-800 border-amber-200',
    };
  }

  return {
    level: 'unknown',
    shortLabel: 'Unknown',
    tooltip: 'Identity: Unknown – Round has almost no signals yet.',
    colorClass: 'bg-slate-100 text-slate-700 border-slate-200',
  };
}

function isRoundReady(asset: Asset): boolean {
  const identity = computeIdentity(asset);
  const purchaseUrl = asset.purchase_url || '';
  const hasZooplaOrRightmove =
    purchaseUrl.includes('zoopla.') ||
    purchaseUrl.includes('rightmove.');

  const hasGenericContext =
    !!asset.purchase_url ||
    !!asset.notes_internal ||
    !!asset.receipt_url;

  const isHome = isHomeCategory(asset);

  if (isHome) {
    const hasTitle = !!asset.title;
    const hasCity = !!asset.city;
    const hasCountry = !!asset.country;
    const hasFullAddress = hasTitle && hasCity && hasCountry;

    // For homes: Round-Ready = full address + Zoopla/Rightmove link
    return hasFullAddress && hasZooplaOrRightmove;
  }

  return (
    (identity.level === 'good' ||
      identity.level === 'strong') &&
    hasGenericContext
  );
}

function getRoundNextSteps(asset: Asset): string[] {
  if (!asset) return [];

  const isHome = isHomeCategory(asset);
  const purchaseUrl = asset.purchase_url || '';
  const hasZooplaOrRightmove =
    purchaseUrl.includes('zoopla.') ||
    purchaseUrl.includes('rightmove.');

  const hasBrand = !!asset.brand;
  const hasModel = !!asset.model_name;
  const hasCategory =
    !!asset.category_id || !!asset.category?.name;
  const hasPurchasePrice =
    asset.purchase_price !== null &&
    asset.purchase_price !== undefined;
  const hasPurchaseDate = !!asset.purchase_date;
  const hasContext =
    !!asset.purchase_url ||
    !!asset.notes_internal ||
    !!asset.receipt_url;

  const hints: string[] = [];

  if (isHome) {
    const hasTitle = !!asset.title;
    const hasCity = !!asset.city;
    const hasCountry = !!asset.country;
    const hasFullAddress = hasTitle && hasCity && hasCountry;

    const roundReady = hasFullAddress && hasZooplaOrRightmove;

    if (roundReady) {
      hints.push(
        'This home is Round-Ready. Next step: connect it to live property market data so Round can refresh valuations automatically.'
      );
      hints.push(
        'Keep feeding Round with upgrades, service history and key documents – it will all support future valuations and resale discussions.'
      );
      return hints;
    }

    if (!hasFullAddress) {
      hints.push(
        'Add the full address – street, city and country (and ideally postcode in the title) so Round can locate this home precisely.'
      );
    }

    if (!hasZooplaOrRightmove) {
      hints.push(
        'Add a Zoopla or Rightmove link for this property so Round can tap into existing property data and comparables.'
      );
    }

    if (!hasPurchasePrice) {
      hints.push(
        'Add what you originally paid for this home – that becomes the baseline for tracking your gain over time.'
      );
    }

    if (!hasPurchaseDate) {
      hints.push(
        'Add the purchase date so Round understands how long you have held the property and can model annual appreciation.'
      );
    }

    if (!hasContext) {
      hints.push(
        'Upload your purchase documents or survey, or paste key notes from your solicitor/agent emails so Round has richer context.'
      );
    }

    if (hints.length === 0) {
      hints.push(
        'Add any small missing details above – then this home will be fully Round-Ready.'
      );
    }

    return hints;
  }

  // Non-home assets
  const identityScore =
    (hasBrand ? 1 : 0) +
    (hasModel ? 1 : 0) +
    (hasCategory ? 1 : 0);

  const roundReady =
    (identityScore >= 2) && hasContext;

  if (roundReady) {
    hints.push(
      'This asset is Round-Ready. Next step: plug it into live market data and automated valuations.'
    );
    hints.push(
      'Round will use your receipts, links and notes as the raw material for smarter, ongoing valuations.'
    );
    return hints;
  }

  if (!hasBrand || !hasModel) {
    hints.push(
      'Add brand and model so Round can match this asset accurately against market data.'
    );
  }

  if (!hasCategory) {
    hints.push(
      'Set a category (e.g. Furniture, Tech, Vehicle) so Round compares it to the right market.'
    );
  }

  if (!hasPurchasePrice) {
    hints.push(
      'Add what you originally paid – that’s the baseline for tracking gain or loss.'
    );
  }

  if (!hasPurchaseDate) {
    hints.push(
      'Add the purchase date so Round can understand how the value should move over time.'
    );
  }

  if (!hasContext) {
    hints.push(
      'Upload a receipt, paste an order confirmation, or add a purchase link so Round has something to parse.'
    );
  }

  if (hints.length === 0) {
    hints.push(
      'Add any small missing details above – then this asset will be fully Round-Ready.'
    );
  }

  return hints;
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

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB');
}

export default function AssetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const assetId = params?.id as string;

  const [asset, setAsset] = useState<Asset | null>(null);
  const [valuations, setValuations] =
    useState<any[]>([]);
  const [upgrades, setUpgrades] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [documents, setDocuments] =
    useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningImport, setRunningImport] =
    useState(false);
  const [error, setError] = useState<string | null>(
    null
  );

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
          category_id,
          asset_type_id,
          category:categories ( name )
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

      const normalisedAsset: Asset = {
        ...(assetData as any),
        category: Array.isArray(
          (assetData as any).category
        )
          ? (assetData as any).category[0] ?? null
          : (assetData as any).category ?? null,
      };

      setAsset(normalisedAsset);

      const { data: valuationsData } =
        await supabase
          .from('valuations')
          .select(`
          id,
          asset_id,
          valuation_source,
          suggested_value,
          currency,
          new_price_min,
          new_price_max,
          used_price_min,
          used_price_max,
          raw_data_json,
          created_at
        `)
          .eq('asset_id', assetId)
          .order('created_at', {
            ascending: false,
          });

      setValuations(valuationsData || []);

      const { data: upgradesData } =
        await supabase
          .from('asset_upgrades')
          .select(
            `
          id,
          asset_id,
          title,
          description,
          cost_amount,
          cost_currency,
          completed_at,
          supplier_name,
          notes,
          created_at
        `
          )
          .eq('asset_id', assetId)
          .order('completed_at', {
            ascending: false,
          });

      setUpgrades(upgradesData || []);

      const { data: servicesData } =
        await supabase
          .from('asset_services')
          .select(
            `
          id,
          asset_id,
          title,
          description,
          cost_amount,
          cost_currency,
          service_date,
          provider_name,
          notes,
          created_at
        `
          )
          .eq('asset_id', assetId)
          .order('service_date', {
            ascending: false,
          });

      setServices(servicesData || []);

      const { data: documentsData } =
        await supabase
          .from('asset_documents')
          .select(
            `
          id,
          asset_id,
          asset_upgrade_id,
          asset_service_id,
          bucket,
          path,
          file_name,
          file_type,
          uploaded_at,
          created_at
        `
          )
          .eq('asset_id', assetId)
          .order('uploaded_at', {
            ascending: false,
          });

      setDocuments(documentsData || []);

      setLoading(false);
    };

    load();
  }, [assetId, router]);

  const handleRunRoundImport = async () => {
    if (!asset) return;

    setRunningImport(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      const base =
        asset.current_estimated_value ??
        asset.purchase_price;

      if (!base) {
        setError(
          'Add a purchase price or current estimate before running Round Import.'
        );
        setRunningImport(false);
        return;
      }

      const suggestedValue = Math.round(
        base * 1.03
      );
      const currency =
        asset.estimate_currency ||
        asset.purchase_currency ||
        'GBP';

      const { error: insertError } =
        await supabase
          .from('valuations')
          .insert({
            asset_id: asset.id,
            requested_by: user.id,
            valuation_source:
              'Round Import (demo)',
            suggested_value: suggestedValue,
            currency,
            raw_data_json: {
              placeholder: true,
              rule: '+3%',
              note: 'Demo Round Import placeholder – not live market data yet',
            } as any,
          } as any);

      if (insertError) {
        console.error(insertError);
        setError(
          'Could not create Round Import valuation.'
        );
        setRunningImport(false);
        return;
      }

      const {
        data: valuationsData,
        error: reloadError,
      } = await supabase
        .from('valuations')
        .select(
          `
          id,
          asset_id,
          valuation_source,
          suggested_value,
          currency,
          new_price_min,
          new_price_max,
          used_price_min,
          used_price_max,
          raw_data_json,
          created_at
        `
        )
        .eq('asset_id', asset.id)
        .order('created_at', {
          ascending: false,
        });

      if (!reloadError && valuationsData) {
        setValuations(valuationsData);
      }
    } catch (err) {
      console.error(err);
      setError(
        'Something went wrong while running Round Import.'
      );
    } finally {
      setRunningImport(false);
    }
  };

  const handleUploadDocument = async (
    scope: 'asset' | 'upgrade' | 'service',
    targetId: string | null,
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file || !asset) return;

    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      const bucket = 'documents';
      const safeName = file.name.replace(
        /[^\w.\-]+/g,
        '_'
      );
      const filePath = `${user.id}/${asset.id}/${Date.now()}-${safeName}`;

      const { error: uploadError } =
        await supabase.storage
          .from(bucket)
          .upload(filePath, file);

      if (uploadError) {
        console.error(uploadError);
        setError('Could not upload document.');
        return;
      }

      const payload: any = {
        asset_id: asset.id,
        owner_id: user.id,
        bucket,
        path: filePath,
        file_name: file.name,
        file_type: file.type || null,
      };

      if (scope === 'upgrade') {
        payload.asset_upgrade_id = targetId;
      } else if (scope === 'service') {
        payload.asset_service_id = targetId;
      }

      const { error: docError } =
        await supabase
          .from('asset_documents')
          .insert(payload);

      if (docError) {
        console.error(docError);
        setError('Could not save document.');
        return;
      }

      const {
        data: documentsData,
        error: reloadError,
      } = await supabase
        .from('asset_documents')
        .select(
          `
          id,
          asset_id,
          asset_upgrade_id,
          asset_service_id,
          bucket,
          path,
          file_name,
          file_type,
          uploaded_at,
          created_at
        `
        )
        .eq('asset_id', asset.id)
        .order('uploaded_at', {
          ascending: false,
        });

      if (!reloadError && documentsData) {
        setDocuments(documentsData);
      }

      event.target.value = '';
    } catch (err) {
      console.error(err);
      setError(
        'Something went wrong while uploading.'
      );
    }
  };

  const handleBack = () => {
    router.push('/dashboard');
  };

  const handleEdit = () => {
    if (!assetId) return;
    router.push(`/assets/${assetId}/edit`);
  };

  if (loading) {
    return <div className="p-6">
      Loading asset…
    </div>;
  }

  if (!asset) {
    return (
      <div className="p-6">
        <p className="mb-2 text-sm text-red-600">
          Could not find this asset.
        </p>
        <button
          className="rounded border px-3 py-1.5 text-sm"
          onClick={handleBack}
        >
          Back to portfolio
        </button>
      </div>
    );
  }

  const identity = computeIdentity(asset);
  const roundReady = isRoundReady(asset);
  const roundNextSteps = getRoundNextSteps(asset);
  const categoryName = getCategoryName(asset);
  const isHome = isHomeCategory(asset);

  const assetLevelDocuments = documents.filter(
    (d) => !d.asset_upgrade_id && !d.asset_service_id
  );

  return (
    <div className="space-y-6 p-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <button
          className="text-sm text-slate-600 hover:text-slate-900"
          onClick={handleBack}
        >
          ← Back to portfolio
        </button>
        <div className="flex items-center gap-2">
          <button
            className="rounded border px-3 py-1.5 text-sm"
            onClick={handleEdit}
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

      {/* Asset overview */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 rounded border bg-white p-4 text-sm">
          <p className="text-xs font-medium text-slate-500">
            Asset
          </p>
          <h1 className="text-lg font-semibold">
            {asset.title}
          </h1>
          <p className="text-xs text-slate-600">
            {categoryName !== '—' && (
              <span className="mr-2 inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                {categoryName}
              </span>
            )}
            {asset.city && asset.country && (
              <span className="text-slate-500">
                {asset.city}, {asset.country}
              </span>
            )}
          </p>
          <p className="text-xs text-slate-500">
            Status:{' '}
            <span className="capitalize">
              {asset.status ?? 'unknown'}
            </span>
          </p>
          {!isHome && (
            <div className="mt-3 space-y-1 text-xs text-slate-700">
              <p>
                <span className="font-medium">
                  Brand:
                </span>{' '}
                {asset.brand || '—'}
              </p>
              <p>
                <span className="font-medium">
                  Model:
                </span>{' '}
                {asset.model_name || '—'}
              </p>
              <p>
                <span className="font-medium">
                  Serial / ID:
                </span>{' '}
                {asset.serial_number || '—'}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-3 rounded border bg-white p-4 text-sm">
          <p className="text-xs font-medium text-slate-500">
            Value snapshot
          </p>
          <div className="flex flex-col gap-2">
            <p className="text-sm">
              Purchase:{' '}
              <span className="font-semibold">
                {formatMoney(
                  asset.purchase_price,
                  asset.purchase_currency
                )}
              </span>{' '}
              {asset.purchase_date && (
                <span className="text-xs text-slate-500">
                  (on {formatDate(asset.purchase_date)})
                </span>
              )}
            </p>
            <p className="text-sm">
              Current estimate:{' '}
              <span className="font-semibold">
                {formatMoney(
                  asset.current_estimated_value,
                  asset.estimate_currency
                )}
              </span>
            </p>
          </div>

          <div className="mt-2 space-y-2 text-xs">
            <div>
              <span className="mr-2 text-xs font-medium">
                Identity:
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${identity.colorClass}`}
                title={identity.tooltip}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {identity.shortLabel}
              </span>
              {roundReady && (
                <span
                  className="ml-2 inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800"
                  title="Round-Ready: Round has enough identity and context to start automated valuations."
                >
                  ✨ Round-Ready
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600">
              For now, these values use simple placeholder
              logic – not live market data yet.
            </p>
          </div>

          <div className="pt-2">
            <button
              onClick={handleRunRoundImport}
              disabled={runningImport}
              className="rounded bg-black px-4 py-2 text-xs font-medium text-white disabled:bg-slate-500"
            >
              {runningImport
                ? 'Running Round Import…'
                : 'Run Round Import (demo)'}
            </button>
          </div>
        </div>
      </div>

      {/* What Round needs next */}
      <div className="rounded border bg-amber-50 p-4 text-sm">
        <p className="mb-1 text-sm font-medium">
          What Round needs next
        </p>
        <p className="mb-2 text-xs text-slate-700">
          A quick checklist of what to add so Round can
          confidently keep this asset valued over time.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          {roundNextSteps.map((hint, idx) => (
            <li
              key={idx}
              className="text-xs text-slate-800"
            >
              {hint}
            </li>
          ))}
        </ul>
      </div>

      {/* Valuation history */}
      <div className="space-y-3 rounded border bg-white p-4 text-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">
              Valuation history
            </p>
            <p className="text-xs text-slate-600">
              Manual entries and Round Import demo valuations
              for this asset.
            </p>
          </div>
          <button
            onClick={handleRunRoundImport}
            disabled={runningImport}
            className="rounded border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:bg-slate-500"
          >
            {runningImport
              ? 'Running Round Import…'
              : 'Run Round Import (demo)'}
          </button>
        </div>

        {valuations.length === 0 ? (
          <p className="text-xs text-slate-500">
            No valuations recorded yet.
          </p>
        ) : (
          <table className="mt-2 w-full border-collapse text-xs">
            <thead>
              <tr className="border-b">
                <th className="py-1 text-left">
                  Date
                </th>
                <th className="py-1 text-left">
                  Source
                </th>
                <th className="py-1 text-right">
                  Suggested value
                </th>
                <th className="py-1 text-left">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody>
              {valuations.map((v) => (
                <tr
                  key={v.id}
                  className="border-b align-top"
                >
                  <td className="py-1">
                    {formatDate(v.created_at)}
                  </td>
                  <td className="py-1">
                    {v.valuation_source ||
                      'Manual'}
                  </td>
                  <td className="py-1 text-right">
                    {formatMoney(
                      v.suggested_value,
                      v.currency
                    )}
                  </td>
                  <td className="py-1 text-xs text-slate-600">
                    {v.raw_data_json?.placeholder
                      ? 'Demo placeholder valuation (not live market data).'
                      : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Upgrades & Improvements */}
      <div className="space-y-3 rounded border bg-white p-4 text-sm">
        <p className="text-sm font-medium">
          Upgrades & Improvements
        </p>
        <p className="text-xs text-slate-600">
          Track investments that enhance this asset – useful
          for both value and service history.
        </p>

        {upgrades.length === 0 ? (
          <p className="text-xs text-slate-500">
            No upgrades recorded yet.
          </p>
        ) : (
          <div className="space-y-3">
            {upgrades.map((u) => {
              const upgradeDocs = documents.filter(
                (d) => d.asset_upgrade_id === u.id
              );
              return (
                <div
                  key={u.id}
                  className="rounded border bg-slate-50 p-3 text-xs"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {u.title}
                      </p>
                      <p className="text-slate-600">
                        {u.description}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">
                        {formatMoney(
                          u.cost_amount,
                          u.cost_currency
                        )}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {u.completed_at
                          ? formatDate(
                              u.completed_at
                            )
                          : 'Date unknown'}
                      </p>
                    </div>
                  </div>
                  {u.supplier_name && (
                    <p className="mt-1 text-[11px] text-slate-500">
                      Supplier: {u.supplier_name}
                    </p>
                  )}
                  {u.notes && (
                    <p className="mt-1 text-[11px] text-slate-600">
                      {u.notes}
                    </p>
                  )}

                  <div className="mt-2 space-y-1">
                    <p className="text-[11px] font-medium text-slate-700">
                      Documents
                    </p>
                    {upgradeDocs.length === 0 ? (
                      <p className="text-[11px] text-slate-500">
                        No documents yet.
                      </p>
                    ) : (
                      <ul className="list-disc space-y-0.5 pl-5">
                        {upgradeDocs.map((d) => (
                          <li
                            key={d.id}
                            className="text-[11px]"
                          >
                            <a
                              href={supabase.storage
                                .from(d.bucket)
                                .getPublicUrl(
                                  d.path
                                ).data.publicUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-slate-800 underline"
                            >
                              {d.file_name ||
                                'Document'}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-1">
                      <label className="inline-flex cursor-pointer items-center justify-center rounded border border-dashed border-slate-300 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50">
                        Add document
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) =>
                            handleUploadDocument(
                              'upgrade',
                              u.id,
                              e
                            )
                          }
                        />
                      </label>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Home Service History */}
      <div className="space-y-3 rounded border bg-white p-4 text-sm">
        <p className="text-sm font-medium">
          Home Service History
        </p>
        <p className="text-xs text-slate-600">
          Boiler services, safety checks, inspections and more
          – all in one place.
        </p>

        {services.length === 0 ? (
          <p className="text-xs text-slate-500">
            No services recorded yet.
          </p>
        ) : (
          <div className="space-y-3">
            {services.map((s) => {
              const serviceDocs = documents.filter(
                (d) => d.asset_service_id === s.id
              );
              return (
                <div
                  key={s.id}
                  className="rounded border bg-slate-50 p-3 text-xs"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {s.title}
                      </p>
                      <p className="text-slate-600">
                        {s.description}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">
                        {formatMoney(
                          s.cost_amount,
                          s.cost_currency
                        )}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {s.service_date
                          ? formatDate(
                              s.service_date
                            )
                          : 'Date unknown'}
                      </p>
                    </div>
                  </div>
                  {s.provider_name && (
                    <p className="mt-1 text-[11px] text-slate-500">
                      Provider: {s.provider_name}
                    </p>
                  )}
                  {s.notes && (
                    <p className="mt-1 text-[11px] text-slate-600">
                      {s.notes}
                    </p>
                  )}

                  <div className="mt-2 space-y-1">
                    <p className="text-[11px] font-medium text-slate-700">
                      Documents
                    </p>
                    {serviceDocs.length === 0 ? (
                      <p className="text-[11px] text-slate-500">
                        No documents yet.
                      </p>
                    ) : (
                      <ul className="list-disc space-y-0.5 pl-5">
                        {serviceDocs.map((d) => (
                          <li
                            key={d.id}
                            className="text-[11px]"
                          >
                            <a
                              href={supabase.storage
                                .from(d.bucket)
                                .getPublicUrl(
                                  d.path
                                ).data.publicUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-slate-800 underline"
                            >
                              {d.file_name ||
                                'Document'}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-1">
                      <label className="inline-flex cursor-pointer items-center justify-center rounded border border-dashed border-slate-300 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50">
                        Add document
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) =>
                            handleUploadDocument(
                              'service',
                              s.id,
                              e
                            )
                          }
                        />
                      </label>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Asset-level documents */}
      <div className="space-y-3 rounded border bg-white p-4 text-sm">
        <p className="text-sm font-medium">
          Key documents for this asset
        </p>
        <p className="text-xs text-slate-600">
          Store surveys, certificates, manuals or other
          documents directly against the asset.
        </p>

        {assetLevelDocuments.length === 0 ? (
          <p className="text-xs text-slate-500">
            No documents uploaded yet.
          </p>
        ) : (
          <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
            {assetLevelDocuments.map((d) => (
              <li key={d.id}>
                <a
                  href={supabase.storage
                    .from(d.bucket)
                    .getPublicUrl(
                      d.path
                    ).data.publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-800 underline"
                >
                  {d.file_name || 'Document'}
                </a>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-2">
          <label className="inline-flex cursor-pointer items-center justify-center rounded border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50">
            Add document to asset
            <input
              type="file"
              className="hidden"
              onChange={(e) =>
                handleUploadDocument(
                  'asset',
                  null,
                  e
                )
              }
            />
          </label>
        </div>
      </div>
    </div>
  );
}
