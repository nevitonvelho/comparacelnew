import { NextRequest, NextResponse } from 'next/server';
import { getAdminDatabase } from '@/lib/firebase/admin';
import { readCategorySettings } from '@/lib/category-settings';
import { priceHistoryPoints } from '@/lib/price-history';
import { readProductMetrics } from '@/lib/product-metrics-store';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' };
// Public, read-only data already visible on the website. No user records are exposed.
export async function GET(request: NextRequest) {
  try {
    const db = getAdminDatabase();
    const id = request.nextUrl.searchParams.get('product');
    if (!id) return NextResponse.json(await readCategorySettings(db), { headers });
    if (!/^[a-zA-Z0-9_-]{1,400}$/.test(id)) return NextResponse.json({ error: 'Produto inválido.' }, { status: 400, headers });
    const product = await db.doc(`products/${id}`).get();
    if (product.data()?.isActive !== true) return NextResponse.json({ error: 'Produto indisponível.' }, { status: 404, headers });
    const [history, metrics] = await Promise.allSettled([
      db.collection('priceHistory').where('productSlug', '==', id).get().then(snapshot => priceHistoryPoints(snapshot.docs.map(doc => doc.data()))),
      readProductMetrics(db, id),
    ]);
    const points = history.status === 'fulfilled' ? history.value : [];
    const stores = [...new Set(points.map(point => point.storeId))];
    return NextResponse.json({
      history: stores.flatMap(store => points.filter(point => point.storeId === store).slice(-120)),
      historyUnavailable: history.status === 'rejected', metrics: metrics.status === 'fulfilled' ? metrics.value : null,
    }, { headers });
  } catch { return NextResponse.json({ error: 'Dados indisponíveis. Tente novamente.' }, { status: 503, headers }); }
}
