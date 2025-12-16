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
  } | null;
};

type IdentityLevel = 'unknown' | 'basic' | 'good' | 'strong';
type FilterMode = 'all' | 'roundReady' | 'needsInfo';

function getCategoryName(asset: Asset): string {
  if (!asset.category) return '—';
  return asset.category.name ?? '—';
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
  const hasContext =
    !!asset.purchase_url || !!asset.notes_internal || !!asset.receipt_url;

  return (
    (identity.level === 'good' || identity.level === 'strong') && hasContext
  );
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

function computeDelta(asset: Asset) {
  if (
    asset.purchase_price == null ||
    asset.current_estimated_value == null ||
    asset.purchase_price === 0
  ) {
    return null;
  }

  const diff = asset.current_estimated_value - asset.purchase_price;
  const pct = (diff / asset.purchase_price) * 100;

  return { diff, pct };
}

export default function DashboardPage() {
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterMode>('all');

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
        const normalised: Asset[] = (data as any[]).map((row) => ({
          ...row,
          category: Array.isArray(row.category)
            ? row.category[0] ?? null
            : row.category ?? null,
        }));
        setAssets(normalised);
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

  const roundReadyCount = assets.filter((a) => isRoundReady(a)).length;
  const needsInfoCount = assets.length - roundReadyCount;

  const filteredAssets =
    filter === 'all'
      ? assets
      : filter === 'roundReady'
      ? assets.filter((a) => isRoundReady(a))
      : assets.filter((a) => !isRoundReady(a));

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="space-y-4 p-6">
      {/* Header with buttons */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your asset portfolio</h1>
        <div className="flex items-center gap-2">
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

      {/* Portfolio totals */}
      <div className="rounded border bg-slate-50 p-4 text-sm">
        <p className="mb-2 font-medium">Portfolio totals</p>
        <div className="flex flex-col gap-1 md:flex-row md:gap-4">
          <span>
            Total purchase value:{' '}
            <span className="font-semibold">
              {formatMoney(totalPurchase || 0)}
            </span>
          </span>
          <span>
            Total current estimated value:{' '}
            <span className="font-semibold">
              {formatMoney(totalCurrent || 0)}
            </span>
          </span>
          {totalPurchase > 0 && (
            <span className="text-slate-700">
              Overall change:{' '}
              {(() => {
                const diff = totalCurrent - totalPurchase;
                const pct = (diff / totalPurchase) * 100;
                const sign = diff > 0 ? '+' : diff < 0 ? '−' : '';
                const arrow = diff > 0 ? '⬆️' : diff < 0 ? '⬇️' : '⟲';
                return (
                  <span className="font-semibold">
                    {arrow} {sign}
                    {Math.abs(pct).toFixed(1)}%
                  </span>
                );
              })()}
            </span>
          )}
        </div>
      </div>

      {/* Round-Ready summary + filters */}
      <div className="flex flex-col justify-between gap-3 rounded border bg-white p-4 text-sm md:flex-row md:items-center">
        <div className="space-y-1">
          <p className="font-medium">Round-Ready coverage</p>
          <p className="text-xs text-slate-600">
            Round-Ready means Round has enough identity and context to start
            automated valuations (brand/model/category + purchase context).
          </p>
          <p className="text-xs text-slate-700">
            <span className="font-semibold">{roundReadyCount}</span> of{' '}
            <span className="font-semibold">{assets.length}</span> assets are
            Round-Ready.{' '}
            <span className="text-slate-500">
              {needsInfoCount > 0
                ? `${needsInfoCount} still need a bit more information.`
                : 'Everything is ready to go.'}
            </span>
          </p>
        </div>

        <div className="flex gap-2 text-xs">
          <button
            onClick={() => setFilter('all')}
            className={`rounded-full border px-3 py-1 ${
              filter === 'all'
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-700'
            }`}
          >
            All ({assets.length})
          </button>
          <button
            onClick={() => setFilter('roundReady')}
            className={`rounded-full border px-3 py-1 ${
              filter === 'roundReady'
                ? 'border-emerald-700 bg-emerald-700 text-white'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800'
            }`}
          >
            Round-Ready ({roundReadyCount})
          </button>
          <button
            onClick={() => setFilter('needsInfo')}
            className={`rounded-full border px-3 py-1 ${
              filter === 'needsInfo'
                ? 'border-amber-700 bg-amber-700 text-white'
                : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}
          >
            Needs info ({needsInfoCount})
          </button>
        </div>
      </div>

      {/* Table */}
      {filteredAssets.length === 0 ? (
        <p className="text-sm text-slate-600">
          No assets match this filter yet.
        </p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2 text-left">Title</th>
              <th className="py-2 text-left">Category</th>
              <th className="py-2 text-left">Identity</th>
              <th className="py-2 text-left">Status</th>
              <th className="py-2 text-right">
                <span
                  className="cursor-help underline decoration-dotted decoration-slate-400"
                  title="What you originally paid for this asset (excluding services/upgrades)."
                >
                  Purchase (£)
                </span>
              </th>
              <th className="py-2 text-right">
                <span
                  className="cursor-help underline decoration-dotted decoration-slate-400"
                  title="Your latest estimate of what the asset is worth today."
                >
                  Current (£)
                </span>
              </th>
              <th className="py-2 text-right">
                <span
                  className="cursor-help underline decoration-dotted decoration-slate-400"
                  title="Simple placeholder: difference between current estimate and purchase price (not live market data yet)."
                >
                  Change
                </span>
              </th>
              <th className="py-2 text-center">
                <span
                  className="cursor-help underline decoration-dotted decoration-slate-400"
                  title="Signals that help Round understand the asset: purchase links, notes, receipts."
                >
                  Context
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredAssets.map((asset) => {
              const identity = computeIdentity(asset);
              const roundReady = isRoundReady(asset);
              const categoryName = getCategoryName(asset);
              const hasContext =
                !!asset.purchase_url ||
                !!asset.notes_internal ||
                !!asset.receipt_url;
              const delta = computeDelta(asset);

              const diffSign =
                delta && delta.diff !== 0
                  ? delta.diff > 0
                    ? '+'
                    : '−'
                  : '';
              const arrow =
                delta && delta.diff !== 0
                  ? delta.diff > 0
                    ? '⬆️'
                    : '⬇️'
                  : '⟲';
              const diffAbs = delta ? Math.abs(delta.diff) : 0;
              const pctAbs = delta ? Math.abs(delta.pct) : 0;

              return (
                <tr
                  key={asset.id}
                  className="cursor-pointer border-b hover:bg-slate-50"
                  onClick={() => router.push(`/assets/${asset.id}`)}
                >
                  <td className="py-2">{asset.title}</td>
                  <td className="py-2">{categoryName}</td>
                  <td className="py-2">
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
                  </td>
                  <td className="py-2 capitalize">
                    {asset.status ?? 'unknown'}
                  </td>
                  <td className="py-2 text-right">
                    {formatMoney(
                      asset.purchase_price,
                      asset.purchase_currency
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {formatMoney(
                      asset.current_estimated_value,
                      asset.estimate_currency
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {delta ? (
                      <span
                        className={
                          delta.diff > 0
                            ? 'text-emerald-700'
                            : delta.diff < 0
                            ? 'text-red-700'
                            : 'text-slate-700'
                        }
                      >
                        {arrow}{' '}
                        {diffSign}
                        {formatMoney(diffAbs, asset.estimate_currency).replace(
                          /^£/,
                          ''
                        )}{' '}
                        ({diffSign}
                        {pctAbs.toFixed(1)}%)
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="py-2 text-center text-base">
                    {asset.purchase_url && (
                      <span title="Has purchase link" className="mr-1">
                        🔗
                      </span>
                    )}
                    {asset.receipt_url && (
                      <span title="Has receipt PDF" className="mr-1">
                        📄
                      </span>
                    )}
                    {asset.notes_internal && (
                      <span title="Has internal notes">📝</span>
                    )}
                    {!hasContext && <span className="text-xs">—</span>}
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
