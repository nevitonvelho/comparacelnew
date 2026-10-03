import { applicationDefault,initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app=initializeApp({credential:applicationDefault(),projectId:'comparacel'});
const db=getFirestore(app);
const first=await db.collection('products').where('isActive','==',true).limit(1).get();
try {
 const likes=await db.collectionGroup('likedProducts').where('productId','==',first.docs[0].id).count().get();
 console.log('Contagem de favoritos disponível:',likes.data().count);
} catch(error) {console.log('Erro do Firestore:',error.code,error.message);process.exitCode=1;}
