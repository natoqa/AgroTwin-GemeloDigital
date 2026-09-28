import { describe, expect, it } from 'vitest';
import { BackupFormatError } from '../errors/BackupFormatError.js';
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, parseBackup, serializeBackup } from './BackupDocument.js';
import type { BackupDocument } from './BackupDocument.js';

/**
 * The refusal paths of the backup parser.
 *
 * A backup is the farmer's only copy of the twin, so the parser's job is to be
 * *rude*: anything it cannot restore whole is refused with a message naming
 * the field. These tests exist because every one of those branches is a case
 * where the alternative is a half-restored twin that looks fine.
 */
const minimal: BackupDocument = {
  format: BACKUP_FORMAT,
  formatVersion: BACKUP_FORMAT_VERSION,
  createdAt: 1_790_000_000_000,
  plots: [{ id: 'p1', name: 'Chacra', createdAt: 1_000 }],
  campaigns: [
    {
      id: 'c1',
      plotId: 'p1',
      crop: 'potato',
      plantingDate: '2026-09-01',
      startedAt: 1_000,
      status: 'active',
    },
  ],
  observations: [
    {
      id: 'o1',
      plotId: 'p1',
      campaignId: 'c1',
      at: 2_000,
      date: '2026-09-02',
      diagnosis: { class: 'healthy', confidence: 0.9, modelVersion: 'mock-1' },
    },
  ],
  snapshots: [
    {
      id: 's1',
      plotId: 'p1',
      campaignId: 'c1',
      at: 2_000,
      date: '2026-09-02',
      diagnosis: { class: 'healthy', confidence: 0.9, modelVersion: 'mock-1' },
      confidence: 0.9,
      provenance: [{ field: 'diagnosis', source: 'image_diagnosis', confidence: 0.9 }],
    },
  ],
  images: [],
  weatherObservations: [
    { plotId: 'p1', date: '2026-09-01', rainfall: 'none', coldNight: false, recordedAt: 3_000 },
  ],
};

const onlyCampaign = minimal.campaigns[0]!;
const onlyObservation = minimal.observations[0]!;
const onlySnapshot = minimal.snapshots[0]!;

const withText = (mutate: (document: Record<string, unknown>) => void): string => {
  const copy = JSON.parse(serializeBackup(minimal)) as Record<string, unknown>;
  mutate(copy);
  return JSON.stringify(copy);
};

const first = (document: Record<string, unknown>, key: string): Record<string, unknown> =>
  (document[key] as Record<string, unknown>[])[0] as Record<string, unknown>;

describe('parseBackup accepts what it wrote', () => {
  it('round-trips a minimal document', () => {
    expect(parseBackup(serializeBackup(minimal))).toEqual(minimal);
  });

  it('keeps optional fields that are present', () => {
    const full: BackupDocument = {
      ...minimal,
      plots: [
        {
          id: 'p1',
          name: 'Chacra',
          createdAt: 1_000,
          area: 0.4,
          location: { latitude: -8, longitude: -78, altitude: 3100 },
        },
      ],
      campaigns: [
        { ...onlyCampaign, status: 'closed', closedOn: '2026-12-01', closedAt: 9_000 },
      ],
      observations: [
        {
          ...onlyObservation,
          imageRef: 'original-1',
          thumbnailRef: 'thumbnail-1',
          note: 'manchas',
        },
      ],
      snapshots: [{ ...onlySnapshot, observationId: 'o1' }],
      images: [
        { ref: 'thumbnail-1', kind: 'thumbnail', contentType: 'image/jpeg', base64: 'AAA=', storedAt: 5 },
      ],
    };

    expect(parseBackup(serializeBackup(full))).toEqual(full);
  });

  it('keeps a location that has no altitude', () => {
    const text = withText((document) => {
      first(document, 'plots')['location'] = { latitude: -8, longitude: -78 };
    });

    expect(parseBackup(text).plots[0]?.location).toEqual({ latitude: -8, longitude: -78 });
  });
});

describe('parseBackup refusals', () => {
  it('refuses text that is not JSON', () => {
    expect(() => parseBackup('{oops')).toThrow(/not valid JSON/u);
  });

  it('refuses a root that is not an object', () => {
    expect(() => parseBackup('[]')).toThrow(/not an object/u);
    expect(() => parseBackup('null')).toThrow(/not an object/u);
  });

  it('refuses a file that does not claim to be a backup', () => {
    expect(() => parseBackup(withText((document) => (document['format'] = 'something')))).toThrow(
      /not an agrotwin-backup/u,
    );
  });

  it('refuses a format version it cannot read', () => {
    expect(() => parseBackup(withText((document) => (document['formatVersion'] = 3)))).toThrow(
      /format version 3/u,
    );
  });

  it('refuses a formatVersion that is not a number', () => {
    expect(() => parseBackup(withText((document) => (document['formatVersion'] = '1')))).toThrow(
      BackupFormatError,
    );
  });

  it('refuses a createdAt that is not a number', () => {
    expect(() => parseBackup(withText((document) => (document['createdAt'] = null)))).toThrow(
      /createdAt is not a number/u,
    );
  });

  it('refuses a top-level collection that is not a list', () => {
    for (const key of [
      'plots',
      'campaigns',
      'observations',
      'snapshots',
      'images',
      'weatherObservations',
    ]) {
      expect(() => parseBackup(withText((document) => (document[key] = {})))).toThrow(
        new RegExp(`${key} is not a list`, 'u'),
      );
    }
  });

  it('refuses an entry that is not an object', () => {
    expect(() => parseBackup(withText((document) => (document['plots'] = ['nope'])))).toThrow(
      /plots\[0\] is not an object/u,
    );
  });

  it('names the field when a plot is malformed', () => {
    expect(() => parseBackup(withText((d) => (first(d, 'plots')['id'] = 7)))).toThrow(
      /plots\[0\]\.id is not text/u,
    );
    expect(() => parseBackup(withText((d) => (first(d, 'plots')['createdAt'] = 'x')))).toThrow(
      /plots\[0\]\.createdAt is not a number/u,
    );
    expect(() => parseBackup(withText((d) => (first(d, 'plots')['area'] = 'x')))).toThrow(
      /plots\[0\]\.area is not a number/u,
    );
    expect(() => parseBackup(withText((d) => (first(d, 'plots')['location'] = 5)))).toThrow(
      /plots\[0\]\.location is not an object/u,
    );
    expect(() =>
      parseBackup(
        withText((d) => (first(d, 'plots')['location'] = { latitude: 'x', longitude: 0 })),
      ),
    ).toThrow(/latitude is not a number/u);
    expect(() =>
      parseBackup(
        withText(
          (d) => (first(d, 'plots')['location'] = { latitude: 0, longitude: 0, altitude: 'x' }),
        ),
      ),
    ).toThrow(/altitude is not a number/u);
  });

  it('names the field when a campaign is malformed', () => {
    expect(() => parseBackup(withText((d) => (first(d, 'campaigns')['crop'] = 1)))).toThrow(
      /campaigns\[0\]\.crop is not text/u,
    );
    expect(() => parseBackup(withText((d) => (first(d, 'campaigns')['startedAt'] = 'x')))).toThrow(
      /startedAt is not a number/u,
    );
    expect(() => parseBackup(withText((d) => (first(d, 'campaigns')['closedOn'] = 5)))).toThrow(
      /closedOn is not text/u,
    );
    expect(() => parseBackup(withText((d) => (first(d, 'campaigns')['closedAt'] = 'x')))).toThrow(
      /closedAt is not a number/u,
    );
  });

  it('names the field when an observation is malformed', () => {
    expect(() => parseBackup(withText((d) => (first(d, 'observations')['at'] = 'x')))).toThrow(
      /observations\[0\]\.at is not a number/u,
    );
    expect(() => parseBackup(withText((d) => (first(d, 'observations')['diagnosis'] = 3)))).toThrow(
      /diagnosis is not an object/u,
    );
    expect(() =>
      parseBackup(withText((d) => (first(d, 'observations')['imageRef'] = 4))),
    ).toThrow(/imageRef is not text/u);
    expect(() =>
      parseBackup(withText((d) => (first(d, 'observations')['thumbnailRef'] = 4))),
    ).toThrow(/thumbnailRef is not text/u);
    expect(() => parseBackup(withText((d) => (first(d, 'observations')['note'] = 4)))).toThrow(
      /note is not text/u,
    );
  });

  it('names the field when a snapshot is malformed', () => {
    expect(() => parseBackup(withText((d) => (first(d, 'snapshots')['confidence'] = 'x')))).toThrow(
      /confidence is not a number/u,
    );
    expect(() =>
      parseBackup(withText((d) => (first(d, 'snapshots')['observationId'] = 9))),
    ).toThrow(/observationId is not text/u);
    expect(() => parseBackup(withText((d) => (first(d, 'snapshots')['provenance'] = {})))).toThrow(
      /provenance is not a list/u,
    );
  });

  it('refuses a provenance source it does not know', () => {
    const text = withText((d) => {
      first(d, 'snapshots')['provenance'] = [
        { field: 'diagnosis', source: 'telepathy', confidence: 1 },
      ];
    });

    expect(() => parseBackup(text)).toThrow(/does not know/u);
  });

  it('refuses a provenance entry that is malformed', () => {
    const text = withText((d) => {
      first(d, 'snapshots')['provenance'] = [
        { field: 5, source: 'image_diagnosis', confidence: 1 },
      ];
    });

    expect(() => parseBackup(text)).toThrow(/field is not text/u);
  });

  it('names the field when an image is malformed', () => {
    const text = withText((d) => {
      d['images'] = [{ ref: 'r', kind: 'thumbnail', contentType: 'image/jpeg', base64: 1, storedAt: 5 }];
    });

    expect(() => parseBackup(text)).toThrow(/images\[0\]\.base64 is not text/u);
  });

  it('refuses a diagnosis class it does not know', () => {
    const text = withText((d) => {
      (first(d, 'snapshots')['diagnosis'] as Record<string, unknown>)['class'] = 'sunburn';
    });

    expect(() => parseBackup(text)).toThrow(/does not know/u);
  });

  it('reads a version 1 file as holding no weather answers', () => {
    const text = withText((d) => {
      d['formatVersion'] = 1;
      delete d['weatherObservations'];
    });

    expect(parseBackup(text).weatherObservations).toEqual([]);
  });

  it('names the field when a weather answer is malformed', () => {
    expect(() =>
      parseBackup(withText((d) => (first(d, 'weatherObservations')['coldNight'] = 'yes'))),
    ).toThrow(/weatherObservations\[0\]\.coldNight is not true or false/u);
    expect(() =>
      parseBackup(withText((d) => (first(d, 'weatherObservations')['rainfall'] = 'drizzle'))),
    ).toThrow(/weatherObservations\[0\]\.rainfall names an answer/u);
    expect(() =>
      parseBackup(withText((d) => (first(d, 'weatherObservations')['recordedAt'] = 'x'))),
    ).toThrow(/recordedAt is not a number/u);
  });
});
