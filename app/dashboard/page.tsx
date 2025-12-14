'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

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
  }[] | null;
};

type IdentityLevel = 'unknown' | 'basic' | 'good' | 'strong';
type TrendClass = 'appreciating' | 'depreciating' | 'neutral';

function getCategoryName(asset: Asset | null) {
  if (!asset || !asset.category || asset.category.length === 0) return '—';
  return asset.category[0]?.name ?? '—';
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

  // If linked to a catalog asset type, treat as exact/strong
  if (asset.asset_type_id) {
    return {
      level: 'strong',
      label: 'Identity: Exact match via catalog',
      shortLabel: 'Exact',
      colorClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    };
  }

  let score = 0;

  const categoryName = getCategoryName(asset);
  const hasCategory = !!categoryName && categoryName !== '—';
  const hasBrand = !!asset.brand;
  const hasModel = !!asset.model_name;
  const hasSerial = !!asset.serial_number;

  if (hasCategory) score++;
  if (hasBrand) score++;
  if (hasModel) score++;
  if (hasSerial) score++;

  if (score >= 4) {
    return {
      level: 'strong',
      label: 'Identity: Strong match (brand + model + category + unique ID)',
      shortLabel: 'Strong',
      colorClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    };
  }

  if (score >= 2) {
    return {
      level: 'good',
      label: 'Identity: Good (enough to compare reliably)',
      shortLabel: 'Good',
      colorClass: 'bg-blue-100 text-blue-800 border-blue-200',
    };
  }

  if (score >= 1) {
    return {
      level: 'basic',
      label: 'Identity: Basic (some signals, but needs more detail)',
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

function ColumnHeaderWithTooltip(props: { label: string; tooltip: string }) {
  const { label, tooltip } = props;
  return (
    <div className="group relative inline-flex cursor-default items-center gap-1">
      <span>{label}</span>
      <span className="text-[10px] leading-none text-slate-400">?</span>
      <div className="pointer-events-none absolute left-0 top-full z-10 mt-1 hidden w-52 rounded-md bg-slate-900 px-2 py-1 text-[11px] text-white shadow-lg group-hover:block">
        {tooltip}
      </div>
    </div>
  );
}

function isMagicReady(asset: Asset): boolean {
  const identity = computeIdentity(asset);
  const hasContext =
    !!asset.purchase_url || !!asset.notes_internal || !!asset.receipt_url;

  return (
    (identity.level === 'good' || identity.level === 'strong') && hasContext
  );
}

// Very simple heuristic for “trend class” – just to demonstrate the concept
function classifyTrend(asset: Asset): TrendClass {
  const categoryName = getCategoryName(asset).toLowerCase();
  const title = (asset.title || '').toLowerCase();

  const text = `${categoryName} ${title}`;

  const isProperty =
    text.includes('home') ||
    text.includes('house') ||
    text.includes('flat') ||
    text.includes('apartment') ||
    text.includes('property') ||
    text.includes('real estate') ||
    text.includes('kitchen') ||
    text.includes('bathroom') ||
    text.includes('extension');

  const isVehicle =
    text.includes('car') ||
    text.includes('vehicle') ||
    text.includes('van') ||
    text.includes('bike') ||
    text.includes('motorbike') ||
    text.includes('motorcycle');

  const isElectronics =
    text.includes('phone') ||
    text.includes('laptop') ||
    text.includes('macbook') ||
    text.includes('tv') ||
    text.includes('television') ||
    text.includes('monitor') ||
    text.includes('tablet') ||
    text.includes('camera');

  if (isProperty) return 'appreciating';
  if (isVehicle || isElectronics) return 'depreciating';
  return 'neutral';
}

// Choose a value basis for portfolio stats – prefer current estimate, fall back to purchase
function valueForStats(asset: Asset): number {
  if (asset.current_estimated_value != null) return asset.current_estimated_value;
  if (asset.purchase_price != null) return asset.purchase_price;
  return 0;
}

export default function DashboardPage() {
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMagicReadyOnly, setFilterMagicReadyOnly] = useState(false);

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
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setAssets(data as Asset[]);
      }

      setLoading(false);
    };

    load();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const totalPurchase = assets.reduce(
    (sum, asset) => sum + (asset.purchase_price ?? 0),
    0
  );
  const totalCurrent = assets.reduce(
    (sum, asset) => sum + (asset.current_estimated_value ?? 0),
    0
  );

  // Identity + Magic Import stats (full portfolio)
  const identityStats = assets.reduce(
    (acc, asset) => {
      const identity = computeIdentity(asset);
      acc[identity.level] = acc[identity.level] + 1;
      return acc;
    },
    {
      unknown: 0,
      basic: 0,
      good: 0,
      strong: 0,
    } as Record<IdentityLevel, number>
  );

  const magicReadyCount = assets.filter(isMagicReady).length;

  // Portfolio insights: by category + trend + top assets
  const categoryTotals = new Map<string, number>();
  const trendTotals: Record<TrendClass, number> = {
    appreciating: 0,
    depreciating: 0,
    neutral: 0,
  };

  assets.forEach(asset => {
    const categoryName = getCategoryName(asset);
    const v = valueForStats(asset);

    if (v > 0) {
      // By category
      const prev = categoryTotals.get(categoryName) ?? 0;
      categoryTotals.set(categoryName, prev + v);

      // By trend class
      const trend = classifyTrend(asset);
      trendTotals[trend] += v;
    }
  });

  const sortedCategories = Array.from(categoryTotals.entries()).sort(
    (a, b) => b[1] - a[1]
  );
  const topCategories = sortedCategories.slice(0, 3);

  const topAssets = [...assets]
    .filter(a => valueForStats(a) > 0)
    .sort((a, b) => valueForStats(b) - valueForStats(a))
    .slice(0, 3);

  // Apply filter to visible assets
  const visibleAssets = filterMagicReadyOnly
    ? assets.filter(isMagicReady)
    : assets;

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="space-y-4 p-6">
      {/* Header with buttons */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Your asset portfolio</h1>
          {assets.length > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              Showing{' '}
              <span className="font-semibold">
                {visibleAssets.length} of {assets.length}
              </span>{' '}
              assets
              {filterMagicReadyOnly && ' (Magic-Ready only)'}.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {assets.length > 0 && (
            <button
              type="button"
              onClick={() => setFilterMagicReadyOnly(prev => !prev)}
              className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition ${
                filterMagicReadyOnly
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              <span className="inline-flex h-3 w-3 items-center justify-center rounded-full border border-current text-[9px]">
                {filterMagicReadyOnly ? '✓' : ''}
              </span>
              Magic-Ready only
            </button>
          )}
          <button
            className="rounded border px-3 py-2 text-sm"
            onClick={handleLogout}
          >
            Log out
          </button>
          <button
            className="rounded bg-black px-4 py-2 text-sm text-white"
            onClick={() => router.push('/assets/new')}
          >
            + Add asset
          </button>
        </div>
      </div>

      {/* Portfolio totals + Magic Import overview + Portfolio insights */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Totals */}
        <div className="rounded border bg-slate-50 p-4 text-sm">
          <p className="mb-2 font-medium">Portfolio totals</p>
          {assets.length === 0 ? (
            <p className="text-xs text-slate-600">
              Add your first asset to start tracking value over time.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              <span>
                Total purchase value:{' '}
                <span className="font-semibold">
                  {formatMoney(totalPurchase || 0, 'GBP')}
                </span>
              </span>
              <span>
                Total current estimated value:{' '}
                <span className="font-semibold">
                  {formatMoney(totalCurrent || 0, 'GBP')}
                </span>
              </span>
            </div>
          )}
        </div>

        {/* Magic Import overview */}
        <div className="rounded border bg-white p-4 text-sm">
          <p className="mb-2 font-medium">Magic Import overview</p>
          {assets.length === 0 ? (
            <p className="text-xs text-slate-600">
              Add a few assets with brand, model and a purchase link or
              receipt to see how ready your portfolio is for Magic Import.
            </p>
          ) : (
            <div className="space-y-2 text-xs text-slate-700">
              <p>
                Magic-Ready assets:{' '}
                <span className="font-semibold">
                  {magicReadyCount} / {assets.length}
                </span>
              </p>
              <div className="flex flex-wrap gap-3">
                <span>
                  Strong / Exact:{' '}
                  <span className="font-semibold">
                    {identityStats.strong}
                  </span>
                </span>
                <span>
                  Good:{' '}
                  <span className="font-semibold">
                    {identityStats.good}
                  </span>
                </span>
                <span>
                  Basic:{' '}
                  <span className="font-semibold">
                    {identityStats.basic}
                  </span>
                </span>
                <span>
                  Unknown:{' '}
                  <span className="font-semibold">
                    {identityStats.unknown}
                  </span>
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                An asset is Magic-Ready when Round has a good or strong
                identity (brand + model + category) and at least one
                context source (product URL, notes or receipt PDF). This is
                what enables automated valuations in the future.
              </p>
            </div>
          )}
        </div>

        {/* Portfolio insights */}
        <div className="rounded border bg-white p-4 text-sm">
          <p className="mb-2 font-medium">Portfolio insights (demo)</p>
          {assets.length === 0 ? (
            <p className="text-xs text-slate-600">
              Once you add assets, Round will show where your value sits by
              category and which things are likely appreciating vs
              depreciating.
            </p>
          ) : (
            <div className="space-y-3 text-xs text-slate-700">
              {/* Top categories */}
              <div>
                <p className="mb-1 font-medium text-[11px] uppercase tracking-wide text-slate-500">
                  Top categories by value
                </p>
                {topCategories.length === 0 ? (
                  <p className="text-[11px] text-slate-500">
                    No value data yet.
                  </p>
                ) : (
                  <ul className="space-y-0.5">
                    {topCategories.map(([name, value]) => (
                      <li key={name} className="flex justify-between">
                        <span>{name}</span>
                        <span className="font-semibold">
                          {formatMoney(value, 'GBP')}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Trend classes */}
              <div>
                <p className="mb-1 font-medium text-[11px] uppercase tracking-wide text-slate-500">
                  Likely value profile (demo logic)
                </p>
                <ul className="space-y-0.5">
                  <li className="flex justify-between">
                    <span>Appreciating (property / home)</span>
                    <span className="font-semibold">
                      {formatMoney(trendTotals.appreciating, 'GBP')}
                    </span>
                  </li>
                  <li className="flex justify-between">
                    <span>Depreciating (cars / electronics)</span>
                    <span className="font-semibold">
                      {formatMoney(trendTotals.depreciating, 'GBP')}
                    </span>
                  </li>
                  <li className="flex justify-between">
                    <span>Neutral / other</span>
                    <span className="font-semibold">
                      {formatMoney(trendTotals.neutral, 'GBP')}
                    </span>
                  </li>
                </ul>
              </div>

              {/* Top assets */}
              <div>
                <p className="mb-1 font-medium text-[11px] uppercase tracking-wide text-slate-500">
                  Top assets by value
                </p>
                {topAssets.length === 0 ? (
                  <p className="text-[11px] text-slate-500">
                    No value data yet.
                  </p>
                ) : (
                  <ul className="space-y-0.5">
                    {topAssets.map(asset => (
                      <li
                        key={asset.id}
                        className="flex items-center justify-between"
                      >
                        <div className="flex flex-col">
                          <span>{asset.title}</span>
                          {(asset.brand || asset.model_name) && (
                            <span className="text-[11px] text-slate-500">
                              {[asset.brand, asset.model_name]
                                .filter(Boolean)
                                .join(' ')}
                            </span>
                          )}
                        </div>
                        <span className="font-semibold">
                          {formatMoney(valueForStats(asset), 'GBP')}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <p className="text-[10px] text-slate-400">
                This is placeholder logic to illustrate how Round will show
                appreciating vs depreciating value. In the future this will
                be powered by live market data and richer asset types.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      {assets.length === 0 ? (
        <p className="text-sm text-slate-700">
          You haven&apos;t added any assets yet. Click &ldquo;+ Add
          asset&rdquo; to get started.
        </p>
      ) : visibleAssets.length === 0 ? (
        <p className="text-sm text-slate-700">
          No assets are Magic-Ready yet. Try adding brand, model and a
          purchase link or receipt to your assets.
        </p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2 text-left">
                <ColumnHeaderWithTooltip
                  label="Title"
                  tooltip="The name you gave the asset, e.g. 'Vitra Softshell Chair – Home Office'."
                />
              </th>
              <th className="py-2 text-left">
                <ColumnHeaderWithTooltip
                  label="Category"
                  tooltip="High-level asset type – useful for grouping and comparing similar items."
                />
              </th>
              <th className="py-2 text-left">
                <ColumnHeaderWithTooltip
                  label="Identity"
                  tooltip="How well Round knows what this asset is (brand, model, category and serial/unique ID)."
                />
              </th>
              <th className="py-2 text-left">
                <ColumnHeaderWithTooltip
                  label="Status"
                  tooltip="Owned, for sale, sold or archived – useful for seeing what is still in your portfolio."
                />
              </th>
              <th className="py-2 text-right">
                <ColumnHeaderWithTooltip
                  label="Purchase (£)"
                  tooltip="What you originally paid for the asset."
                />
              </th>
              <th className="py-2 text-right">
                <ColumnHeaderWithTooltip
                  label="Current (£)"
                  tooltip="Your current estimated value for the asset."
                />
              </th>
              <th className="py-2 text-center">
                <ColumnHeaderWithTooltip
                  label="Docs"
                  tooltip="Quick view of whether Round has a purchase link and/or a receipt PDF for this asset."
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleAssets.map(asset => {
              const identity = computeIdentity(asset);
              const magicReady = isMagicReady(asset);

              return (
                <tr
                  key={asset.id}
                  className="cursor-pointer border-b hover:bg-slate-50"
                  onClick={() => router.push(`/assets/${asset.id}`)}
                >
                  <td className="py-2">
                    <div className="flex flex-col">
                      <span>{asset.title}</span>
                      {(asset.brand || asset.model_name) && (
                        <span className="text-[11px] text-slate-500">
                          {[asset.brand, asset.model_name]
                            .filter(Boolean)
                            .join(' ')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2">{getCategoryName(asset)}</td>
                  <td className="py-2">
                    <div className="flex items-center gap-1">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${identity.colorClass}`}
                        title={identity.label}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {identity.shortLabel}
                      </span>
                      {magicReady && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800"
                          title="Magic-Ready: Round has enough identity and context to start automated valuations."
                        >
                          ✨ Ready
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 capitalize">
                    {asset.status ?? 'unknown'}
                  </td>
                  <td className="py-2 text-right">
                    {formatMoney(asset.purchase_price, 'GBP')}
                  </td>
                  <td className="py-2 text-right">
                    {formatMoney(asset.current_estimated_value, 'GBP')}
                  </td>
                  <td className="py-2 text-center">
                    {asset.purchase_url && (
                      <span title="Has purchase link" className="mr-1">
                        🔗
                      </span>
                    )}
                    {asset.receipt_url && (
                      <span title="Has receipt PDF">📄</span>
                    )}
                    {!asset.purchase_url && !asset.receipt_url && <span>—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
