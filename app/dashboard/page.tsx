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

  if (asset.asset_type_id) {
    return {
      level: 'strong',
      label: 'Identity: Exact match',
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
      label: 'Identity: Strong match',
      shortLabel: 'Strong',
      colorClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    };
  }

  if (score >= 2) {
    return {
      level: 'good',
      label: 'Identity: Good',
      shortLabel: 'Good',
      colorClass: 'bg-blue-100 text-blue-800 border-blue-200',
    };
  }

  if (score >= 1) {
    return {
      level: 'basic',
      label: 'Identity: Basic',
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

export default function DashboardPage() {
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

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

  // Magic Import readiness stats
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

  const magicReadyCount = assets.filter(asset => {
    const identity = computeIdentity(asset);
    const hasContext =
      !!asset.purchase_url || !!asset.notes_internal || !!asset.receipt_url;
    return (
      (identity.level === 'good' || identity.level === 'strong') && hasContext
    );
  }).length;

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

      {/* Portfolio totals + Magic Import overview */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded border bg-slate-50 p-4 text-sm">
          <p className="mb-2 font-medium">Portfolio totals</p>
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
        </div>

        <div className="rounded border bg-white p-4 text-sm">
          <p className="mb-2 font-medium">Magic Import overview</p>
          {assets.length === 0 ? (
            <p className="text-xs text-slate-600">
              Add your first asset to see how ready your portfolio is for Magic
              Import.
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
                  <span className="font-semibold">{identityStats.good}</span>
                </span>
                <span>
                  Basic:{' '}
                  <span className="font-semibold">{identityStats.basic}</span>
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
                identity (brand + model + category) and at least one context
                source (product URL, notes or receipt PDF).
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      {assets.length === 0 ? (
        <p>You haven&apos;t added any assets yet.</p>
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
            {assets.map(asset => {
              const identity = computeIdentity(asset);
              const hasContext =
                !!asset.purchase_url ||
                !!asset.notes_internal ||
                !!asset.receipt_url;
              const magicReady =
                (identity.level === 'good' || identity.level === 'strong') &&
                hasContext;

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
