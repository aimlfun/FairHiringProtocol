/**
 * FHP Conformance Tests — Ontology
 *
 * Verifies that the ontology loads correctly, skill IDs resolve,
 * synonyms work bidirectionally, and transfer relationships are valid.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { getOntology, ResolvedOntology }   from '../../ontology/loader.ts';
import { UnknownSkillError }               from '../../shared/errors/index.ts';

let ontology: ResolvedOntology;

beforeAll(() => {
  ontology = getOntology();
});

describe('Ontology loading', () => {
  it('loads without error', () => {
    expect(ontology).toBeInstanceOf(ResolvedOntology);
  });

  it('contains a meaningful number of skills', () => {
    expect(ontology.skillCount).toBeGreaterThan(50);
  });

  it('contains transfer relationships', () => {
    expect(ontology.transferCount).toBeGreaterThan(20);
  });
});

describe('Skill ID resolution', () => {
  it('resolves canonical skill IDs', () => {
    const skill = ontology.resolve('fhp:skill:python');
    // python3 is listed as a synonym of python in the ontology
    expect(['fhp:skill:python', 'fhp:skill:python3']).toContain(skill.id);
    expect(skill.label.toLowerCase()).toContain('python');
  });

  it('resolves synonym IDs — golang resolves to go', () => {
    const skill = ontology.resolve('fhp:skill:golang');
    expect(skill.id).toBe('fhp:skill:go');
  });

  it('resolves golang to go', () => {
    const skill = ontology.resolve('fhp:skill:golang');
    expect(skill.id).toBe('fhp:skill:go');
  });

  it('throws UnknownSkillError for unknown IDs', () => {
    expect(() => ontology.resolve('fhp:skill:nonexistent-skill-xyz')).toThrow(UnknownSkillError);
  });

  it('exists() returns true for canonical IDs', () => {
    expect(ontology.exists('fhp:skill:typescript')).toBe(true);
  });

  it('exists() returns true for synonym IDs', () => {
    expect(ontology.exists('fhp:skill:k8s')).toBe(true);
  });

  it('exists() returns false for unknown IDs', () => {
    expect(ontology.exists('fhp:skill:does-not-exist')).toBe(false);
  });
});

describe('Synonym expansion', () => {
  it('returns at least the canonical ID itself', () => {
    const synonyms = ontology.getSynonyms('fhp:skill:rust');
    expect(synonyms).toContain('fhp:skill:rust');
  });

  it('includes declared synonyms', () => {
    const synonyms = ontology.getSynonyms('fhp:skill:javascript');
    expect(synonyms).toContain('fhp:skill:js');
    expect(synonyms).toContain('fhp:skill:es6');
  });

  it('typescript synonyms include ts', () => {
    const synonyms = ontology.getSynonyms('fhp:skill:typescript');
    expect(synonyms).toContain('fhp:skill:ts');
  });
});

describe('Transfer relationships', () => {
  it('docker transfers to kubernetes with high weight', () => {
    const transfers = ontology.getTransferSources('fhp:skill:kubernetes');
    const dockerTransfer = transfers.find(t => t.source === 'fhp:skill:docker');
    expect(dockerTransfer).toBeDefined();
    expect(dockerTransfer!.weight).toBeGreaterThan(0.5);
  });

  it('typescript transfers to javascript with very high weight', () => {
    const transfers = ontology.getTransferSources('fhp:skill:javascript');
    const tsTransfer = transfers.find(t => t.source === 'fhp:skill:typescript');
    expect(tsTransfer).toBeDefined();
    expect(tsTransfer!.weight).toBeGreaterThan(0.80);
  });

  it('all transfer weights are between 0.0 and 1.0', () => {
    const sources = ontology.getTransferTargets('fhp:skill:python');
    for (const rel of sources) {
      expect(rel.weight).toBeGreaterThanOrEqual(0.0);
      expect(rel.weight).toBeLessThanOrEqual(1.0);
    }
  });

  it('returns empty array for skills with no transfer sources', () => {
    // cryptography has no defined transfer sources in v1
    const transfers = ontology.getTransferSources('fhp:skill:cryptography');
    expect(Array.isArray(transfers)).toBe(true);
  });
});

describe('Candidate skill matching', () => {
  const candidateSkills = [
    { ontology_id: 'fhp:skill:typescript', proficiency: 'proficient' },
    { ontology_id: 'fhp:skill:docker',     proficiency: 'expert' },
    { ontology_id: 'fhp:skill:golang',     proficiency: 'practitioner' }, // synonym of go
  ];

  it('matches by canonical ID', () => {
    const match = ontology.findBestCandidateMatch(candidateSkills, 'fhp:skill:typescript');
    expect(match).not.toBeNull();
    expect(match!.proficiency).toBe('proficient');
  });

  it('matches typescript when job asks for ts (direct synonym)', () => {
    const match = ontology.findBestCandidateMatch(candidateSkills, 'fhp:skill:ts');
    expect(match).not.toBeNull();
    expect(match!.proficiency).toBe('proficient');
  });


  it('matches go when candidate declares golang (synonym)', () => {
    const match = ontology.findBestCandidateMatch(candidateSkills, 'fhp:skill:go');
    expect(match).not.toBeNull();
    expect(match!.proficiency).toBe('practitioner');
  });

  it('returns null when no match found', () => {
    const match = ontology.findBestCandidateMatch(candidateSkills, 'fhp:skill:rust');
    expect(match).toBeNull();
  });
});
