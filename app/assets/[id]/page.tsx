'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type Asset = {
  id: string;
  title: string;
  brand: string | null;
  model_name: string | null;
  status: string | null;
  current_estimated_value: number | null;
  purchase_price: number | null;
  purchase_date: string | null;
  purchase_url: string | null;
  receipt_url: string | null;
  source_notes: string | null;
  created_at: string;
};

export default function AssetDetailPage() {
  const router = useRouter();
  const params = useParams();
  const assetId = params?.id as string | undefined;

  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!assetId) return;

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
          brand,
          model_name,
          status,
          current_estimated_value,
          purchase_price,
          purchase_date,
          purchase_url,
          receipt_url,
          source_notes,
          created_at
        `
        )
        .eq('id', assetId)
        .eq('owner_id', user.id)
        .single();

      if (error) {
        setError(error.message);
      } else {
        setAsset(data as Asset);
      }

      setLoading(false);
    };

    load();
  }, [assetId, router]);

  const handleDelete = async () => {
    if (!assetId) return;
    const confirmed = window.confirm(
      'Are you sure you want to delete this asset? This cannot be undone.'
    );
    if (!confirmed) return;

    setDeleting(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError('You must be logged in.');
      setDeleting(false);
      return;
    }

    const { error } = await supabase
      .from('assets')
      .delete()
      .eq('id', assetId)
      .eq('owner_id', user.id);

    if (error) {
      setError(error.message);
      setDeleting(false);
      return;
    }

    router.push('/dashboard');
  };

  if (loading) {
    return <div className="p-6">Loading asset…</div>;
  }

  if (error || !asset) {
    return (
      <div className="p-6 space-y-4">
        <p>There was a problem loading this asset.</p>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          className="rounded border px-4 py-2"
          onClick={() => router.push('/dashboard')}
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  const formattedPurchaseDate = asset.purchase_date
    ? new Date(asset.purchase_date).toLocaleDateString()
    : '—';

  const createdAt = new Date(asset.created_at).toLocaleString();

  return (
    <div className="space-y-4 p-6">
      <button
        className="mb-4 text-sm text-blue-600 underline"
        onClick={() => router.push('/dashboard')}
      >
        &larr; Back to dashboard
      </button>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-semibold">{asset.title}</h1>
        <div className="flex gap-2">
          <button
            className="rounded border px-4 py-2 text-sm"
            onClick={() => router.push(`/assets/${asset.id}/edit`)}
          >
            Edit asset
          </button>
          <button
            className="rounded bg-red-600 px-4 py-2 text-sm text-white"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>

      <div className="grid gap-3 text-sm md:grid-cols-2">
        <div>
          <p className="font-medium">Brand</p>
          <p>{asset.brand || '—'}</p>
        </div>
        <div>
          <p className="font-medium">Model</p>
          <p>{asset.model_name || '—'}</p>
        </div>
        <div>
          <p className="font-medium">Status</p>
          <p className="capitalize">{asset.status ?? 'unknown'}</p>
        </div>
        <div>
          <p className="font-medium">Purchase price</p>
          <p>
            {asset.purchase_price != null ? `£${asset.purchase_price}` : '—'}
          </p>
        </div>
        <div>
          <p className="font-medium">Purchase date</p>
          <p>{formattedPurchaseDate}</p>
        </div>
        <div>
          <p className="font-medium">Current estimated value</p>
          <p>
            {asset.current_estimated_value != null
              ? `£${asset.current_estimated_value}`
              : '—'}
          </p>
        </div>
        <div>
          <p className="font-medium">Purchase URL</p>
          {asset.purchase_url ? (
            <a
              href={asset.purchase_url}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 underline break-all"
            >
              {asset.purchase_url}
            </a>
          ) : (
            <p>—</p>
          )}
        </div>
        <div>
          <p className="font-medium">Receipt URL</p>
          {asset.receipt_url ? (
            <a
              href={asset.receipt_url}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 underline break-all"
            >
              {asset.receipt_url}
            </a>
          ) : (
            <p>—</p>
          )}
        </div>
        <div className="md:col-span-2">
          <p className="font-medium">Source notes / email text</p>
          {asset.source_notes ? (
            <pre className="whitespace-pre-wrap rounded border bg-slate-50 p-3 text-xs">
              {asset.source_notes}
            </pre>
          ) : (
            <p>—</p>
          )}
        </div>
        <div>
          <p className="font-medium">Record created</p>
          <p>{createdAt}</p>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-500">
          There was a problem deleting this asset: {error}
        </p>
      )}
    </div>
  );
}