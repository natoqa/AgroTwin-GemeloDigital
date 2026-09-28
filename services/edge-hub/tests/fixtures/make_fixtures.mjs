// Regenerates the cross-language fixtures (run from the repository root, after
// `pnpm build`):
//
//   node services/edge-hub/tests/fixtures/make_fixtures.mjs
//
// It signs a delta with the client's real WebCryptoSigner, through the
// domain's real encoder, so the hub's tests verify a signature produced
// exactly the way a phone produces one. The reverse direction is made by
// make_hub_model.py.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DELTA_MAGIC, encodePackage, signedBytesFor } from '../../../../packages/domain/dist/index.js';
import { WebCryptoSigner } from '../../../../packages/infrastructure/dist/index.js';

const signer = await new WebCryptoSigner().createEphemeralSigner();
const body = Float32Array.from({ length: 12 }, (_, index) => (index === 0 ? 0.5 : 0));
const header = {
  format: 'agrotwin-delta',
  formatVersion: 1,
  backboneVersion: 'bb-1',
  baseHeadVersion: 'bb-1',
  parameterCount: body.length,
  sampleCount: 4,
  clipNorm: 1,
  noiseSigma: 0,
  createdAt: 1,
  ephemeralId: '00ff00ff',
  publicKey: signer.publicKey,
};
const signature = await signer.sign(signedBytesFor(DELTA_MAGIC, header, body));
const out = fileURLToPath(new URL('./webcrypto.agrotwin-delta', import.meta.url));
writeFileSync(out, encodePackage(DELTA_MAGIC, header, body, signature));
console.log(`wrote ${out}`);
