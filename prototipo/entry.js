// Preserve private owner invitations and old bookmarks without loading client UI.
if(location.hash==='#admin'||location.hash.startsWith('#setup/')){
  location.replace('/comanda/'+location.hash);
}else{
  await import('./app.js?v=pending-income-1');
}
