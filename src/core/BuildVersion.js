export const BUILD_REVISION=typeof __BUILD_REVISION__==='string'?__BUILD_REVISION__:'dev';
export const versionedAsset=url=>url+(url.includes('?')?'&':'?')+'v='+encodeURIComponent(BUILD_REVISION);
