'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  category?: {
    name: string | null;
  } | null;
};

type IdentityLevel = 'unknown' | 'basic' | 'good' | 'strong';

function getCategoryName(asset: Asset): string {
  if (!asset.category) return '—';
  return asset.category.name ?? '—';
}

function computeIdentity(asset: Asset): IdentityLevel {
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

  if (score >= 3) return 'strong';
  if (score === 2) return 'good';
  if (score === 1) return 'basic';
  return 'unknown';
}

function identityPillClasses(level: IdentityLevel): string {
  switch (level) {
    case 'strong':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'good':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'basic':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'unknown':
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

function identityPillLabel(level: IdentityLevel): string {
  switch (level) {
    case 'strong':
      return 'Strong';
    case 'good':
      return 'Good';
    case 'basic':
      return 'Basic';
    case 'unknown':
    default:
      return 'Unknown';
  }
}

function identityTooltip(level: IdentityLevel): string {
  switch (level) {
    case 'strong':
      return 'Strong identity: brand, model, category and/or unique ID are clearly defined.';
    case 'good':
      return 'Good identity: at least two of brand, model and category are known.';
    case 'basic':
      return 'Basic identity: Round has one signal, but would benefit from more detail.';
    case 'unknown':
    default:
      return 'Unknown identity: add brand, model or category so Round can recognise this asset.';
  }
}

function isMagicReady(asset: Asset): boolean {
  const identity = computeIdentity(asset);
  const hasContext =
    !!asset.purchase_url || !!asset.notes_internal || !!asset.receipt_url;

  return (
    (identity === 'good' || identity === 'strong') &&
    hasContext
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

type StatusFilter = 'all' | 'owned' | 'for_sale' | 'sold' | 'archived';
type MagicFilter = 'all' | 'magic' | 'needs';

export default function DashboardPage() {
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [magicFilter, setMagicFilter] = useState<MagicFilter>('all');

  useEffect(() => {
    const load = async () => {
      setLoading(true);

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
          category:categories ( name )
        `
        )
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        // Normalise category shape if Supabase returns an array
        const normalised = (data as any[]).map((row) => {
          const cat = row.category;
          let category: { name: string | null } | null = null;

          if (Array.isArray(cat)) {
            category = cat[0] ?? null;
          } else {
            category = cat ?? null;
          }

          return {
            ...row,
            category,
          } as Asset;
        });

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

  const totalPurchase = useMemo(
    () =>
      assets.reduce(
        (sum, asset) => sum + (asset.purchase_price ?? 0),
        0
      ),
    [assets]
  );

  const totalCurrent = useMemo(
    () =>
      assets.reduce(
        (sum, asset) => sum + (asset.current_estimated_value ?? 0),
        0
      ),
    [assets]
  );

  const magicCounts = useMemo(() => {
    const total = assets.length;
    const magicReadyCount = assets.filter(isMagicReady).length;
    return { total, magicReadyCount };
  }, [assets]);

  const filteredAssets = useMemo(() => {
    const q = search.trim().toLowerCase();

    return assets.filter((asset) => {
      // Status filter
      if (statusFilter !== 'all') {
        if ((asset.status ?? 'owned') !== statusFilter) return false;
      }

      // Magic filter
      if (magicFilter === 'magic' && !isMagicReady(asset)) {
        return false;
      }
      if (magicFilter === 'needs' && isMagicReady(asset)) {
        return false;
      }

      // Search filter
      if (!q) return true;

      const categoryName = getCategoryName(asset);
      const haystack = [
        asset.title,
        asset.brand,
        asset.model_name,
        categoryName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [assets, search, statusFilter, magicFilter]);

  if (loading) {
    return <div className="p-6">Loading portfolio…</div>;
  }

  return (
    <div className="space-y-4 p-6">
      {/* Header with buttons */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Your asset portfolio</h1>
          <p className="mt-1 text-sm text-slate-600">
            Track what you own, what you&apos;ve invested and what Round
            is ready to help value.
          </p>
        </div>
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

      {/* Portfolio overview */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Totals */}
        <div className="rounded border bg-slate-50 p-4 text-sm">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Portfolio totals
          </p>
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
          <p className="mt-2 text-[11px] text-slate-500">
            As Round evolves, these numbers will be driven by live market
            data rather than manual estimates.
          </p>
        </div>

        {/* Magic-Ready summary */}
        <div className="rounded border bg-white p-4 text-sm">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Magic Import readiness
          </p>
          <p className="text-sm">
            <span className="font-semibold">
              {magicCounts.magicReadyCount} of {magicCounts.total}
            </span>{' '}
            assets are <span className="font-semibold">Magic-Ready</span>.
          </p>
          <p className="mt-2 text-[11px] text-slate-500">
            Magic-Ready assets have a good or strong identity (brand/model/
            category) plus at least one context source (purchase link, notes
            or receipt) so Round can start automating valuations.
          </p>
        </div>

        {/* Filters */}
        <div className="rounded border bg-white p-4 text-sm">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Filters
          </p>
          <div className="space-y-2">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600">
                Search
              </label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded border px-2 py-1 text-xs"
                placeholder="Search by title, brand, model or category…"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600">
                  Status
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as StatusFilter)
                  }
                  className="rounded border px-2 py-1 text-xs"
                >
                  <option value="all">All</option>
                  <option value="owned">Owned</option>
                  <option value="for_sale">For sale</option>
                  <option value="sold">Sold</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600">
                  Magic Import
                </label>
                <select
                  value={magicFilter}
                  onChange={(e) =>
                    setMagicFilter(e.target.value as MagicFilter)
                  }
                  className="rounded border px-2 py-1 text-xs"
                >
                  <option value="all">All</option>
                  <option value="magic">Magic-Ready</option>
                  <option value="needs">Needs more info</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      {filteredAssets.length === 0 ? (
        <p className="text-sm text-slate-600">
          No assets match your current filters. Try clearing the search or
          filters above.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 text-left">Title</th>
                <th className="py-2 text-left">Category</th>
                <th className="py-2 text-left">
                  <span
                    className="inline-flex items-center gap-1"
                    title="How clearly Round can identify this asset based on brand, model, category and serial number."
                  >
                    Identity
                    <span className="text-xs text-slate-400">ⓘ</span>
                  </span>
                </th>
                <th className="py-2 text-left">
                  <span
                    className="inline-flex items-center gap-1"
                    title="Magic-Ready means Round has enough identity + context (links, notes or receipts) to start automated valuations."
                  >
                    Magic Import
                    <span className="text-xs text-slate-400">ⓘ</span>
                  </span>
                </th>
                <th className="py-2 text-left">Status</th>
                <th className="py-2 text-right">Purchase (£)</th>
                <th className="py-2 text-right">Current (£)</th>
                <th className="py-2 text-center">Docs</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssets.map((asset) => {
                const identityLevel = computeIdentity(asset);
                const magic = isMagicReady(asset);

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
                          <span className="text-xs text-slate-500">
                            {[asset.brand, asset.model_name]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2">
                      {getCategoryName(asset)}
                    </td>
                    <td className="py-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${identityPillClasses(
                          identityLevel
                        )}`}
                        title={identityTooltip(identityLevel)}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {identityPillLabel(identityLevel)}
                      </span>
                    </td>
                    <td className="py-2">
                      {magic ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800"
                          title="This asset is Magic-Ready: Round has enough detail and context to start automated valuations."
                        >
                          ✨ Ready
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600"
                          title="Add brand/model/category and at least one context source (link, notes or receipt) to make this Magic-Ready."
                        >
                          Needs info
                        </span>
                      )}
                    </td>
                    <td className="py-2 capitalize">
                      {asset.status ?? 'owned'}
                    </td>
                    <td className="py-2 text-right">
                      {formatMoney(asset.purchase_price)}
                    </td>
                    <td className="py-2 text-right">
                      {formatMoney(asset.current_estimated_value)}
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
                      {!asset.purchase_url && !asset.receipt_url && (
                        <span>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
