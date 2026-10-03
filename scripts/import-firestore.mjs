import { readFile, writeFile } from 'node:fs/promises';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export function transform(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.model)) groups.set(row.model, new Map());
    groups.get(row.model).set(row.pk, row.fields);
  }
  const records = name => [...(groups.get(name) ?? new Map())];
  const lookup = (name, id) => groups.get(name)?.get(id);
  const related = (name, field, id) => records(name).filter(([, data]) => data[field] === id);
  const cents = value => value == null ? null : Math.round(Number(value) * 100);
  const docs = [];
  for (const [id, product] of records('products.product')) {
    const specs = related('products.specvalue', 'product', id).map(([, value]) => {
      const key = lookup('products.speckey', value.key);
      if (!key) throw new Error(`Atributo ausente: ${value.key}`);
      const group = lookup('products.specgroup', key.group);
      const display = key.data_type === 'bool' ? value.value_bool == null ? '—' : value.value_bool ? 'Sim' : 'Não'
        : key.data_type === 'number' ? value.value_number == null ? '—' : `${Number(value.value_number).toLocaleString('pt-BR')}${key.unit ? ` ${key.unit}` : ''}`
        : value.value_text || '—';
      return { ...value, keySlug: key.slug, name: key.name, unit: key.unit, type: key.data_type, higherIsBetter: key.higher_is_better, group: group?.name ?? '', order: key.order, display };
    });
    const display = slug => specs.find(spec => spec.keySlug === slug)?.display ?? '—';
    const offers = related('pricing.offer', 'product', id).map(([offerId, offer]) => ({ ...offer, id: offerId, priceCents: cents(offer.price), storeName: lookup('pricing.store', offer.store)?.name ?? '' }));
    const available = offers.filter(offer => offer.is_available && offer.priceCents !== null);
    const highlights = related('products.producthighlight', 'product', id).map(([, value]) => value);
    docs.push({ collection: 'products', id: product.slug, data: {
      ...product, legacyId: id, isActive: product.is_active, brandName: lookup('brands.brand', product.brand)?.name ?? '',
      categorySlug: lookup('products.category', product.category)?.slug ?? '', overallScore: Number(product.overall_score),
      bestPriceCents: available.length ? Math.min(...available.map(offer => offer.priceCents)) : null,
      imagePath: product.image || null, label: highlights.find(value => value.kind === 'pro')?.text ?? 'Ficha técnica',
      specs, offers, highlights, scores: related('products.productscore', 'product', id).map(([, value]) => ({ ...value, criterionName: lookup('products.scorecriterion', value.criterion)?.name ?? '' })),
      displaySpecs: { screen: display('tamanho'), chip: display('processador'), battery: display('capacidade'), charge: display('carregamento'), camera: display('camera-principal'), ram: display('ram'), storage: display('armazenamento') },
    } });
  }
  const collections = { 'brands.brand': 'brands', 'products.category': 'categories', 'pricing.store': 'stores', 'pricing.pricehistory': 'priceHistory', 'comparisons.comparison': 'comparisons', 'products.speckey': 'specKeys', 'products.specgroup': 'specGroups', 'products.scorecriterion': 'scoreCriteria' };
  for (const [model, collection] of Object.entries(collections)) {
    for (const [id, value] of records(model)) docs.push({ collection, id: String(id), data: {
      ...value, legacyId: id,
      ...(value.product ? { productSlug: lookup('products.product', value.product)?.slug ?? null } : {}),
      ...(value.product_a ? { productASlug: lookup('products.product', value.product_a)?.slug ?? null, productBSlug: lookup('products.product', value.product_b)?.slug ?? null } : {}),
    } });
  }
  for (const doc of docs) {
    if (!doc.id || doc.id.includes('/')) throw new Error('ID de documento inválido');
    if (Buffer.byteLength(JSON.stringify(doc.data)) > 900_000) throw new Error(`Documento muito grande: ${doc.collection}/${doc.id}`);
  }
  return docs;
}

if (process.argv[1]?.endsWith('import-firestore.mjs')) {
  const input = process.argv[2] ?? 'data/django-export.json';
  const documents = transform(JSON.parse(await readFile(input, 'utf8')));
  const counts = {};
  for (const doc of documents) counts[doc.collection] = (counts[doc.collection] ?? 0) + 1;
  console.log('Plano de importação:', counts);
  await writeFile('data/firestore-import.json', JSON.stringify(documents, null, 2));
  if (!process.argv.includes('--write')) {
    console.log('Simulação concluída. Use --write com credenciais administrativas para importar.');
  } else {
    initializeApp({ credential: applicationDefault(), projectId: 'comparacel' });
    const db = getFirestore();
    // Create only: never overwrite existing Firebase data on repeat runs.
    let created = 0;
    let skipped = 0;
    for (const document of documents) {
      try { await db.collection(document.collection).doc(document.id).create(document.data); created++; }
      catch (error) { if (error.code === 6) skipped++; else throw error; }
    }
    console.log(`Importação concluída: ${created} criados, ${skipped} já existentes.`);
  }
}
