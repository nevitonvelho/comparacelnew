import { applicationDefault } from 'firebase-admin/app';
const {access_token}=await applicationDefault().getAccessToken();
const response=await fetch('https://firestore.googleapis.com/v1/projects/comparacel/databases/(default)/collectionGroups/socialPosts/indexes',{headers:{Authorization:`Bearer ${access_token}`}});
if(!response.ok)throw new Error(`HTTP ${response.status}`);
const data=await response.json();
console.log(JSON.stringify(data.indexes?.map(({state,fields})=>({state,fields}))??[],null,2));
