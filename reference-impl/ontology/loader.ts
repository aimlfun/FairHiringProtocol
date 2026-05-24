/**
 * FHP Ontology Loader & Resolver
 *
 * Loads skills.json at startup, validates it, and exposes query methods
 * used by the matching engine. All lookups are O(1) via pre-built Maps.
 */

import { readFileSync }     from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath }    from 'node:url';
import { UnknownSkillError } from '../shared/errors/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OntologySkill {
  id:       string;
  label:    string;
  domain:   string;
  synonyms: string[];
  tags:     string[];
}

export interface TransferRelationship {
  source:    string;
  target:    string;
  weight:    number;
  rationale: string;
}

export interface OntologyData {
  version:                string;
  published_at:           string;
  skills:                 OntologySkill[];
  transfer_relationships: TransferRelationship[];
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _ontology: ResolvedOntology | null = null;

export function getOntology(): ResolvedOntology {
  if (!_ontology) {
    _ontology = loadOntology();
  }
  return _ontology;
}

// ── Loader ────────────────────────────────────────────────────────────────────

/** Strip // comments from JSON-with-comments, respecting string literals */
function stripJsonComments(text: string): string {
  const result: string[] = [];
  let inString = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (c === '"' && (i === 0 || text[i - 1] !== '\\')) {
      inString = !inString;
    }
    if (!inString && c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    result.push(c);
    i++;
  }
  return result.join('');
}

function loadOntology(): ResolvedOntology {
  const ontologyPath = resolve(__dirname, 'skills.json');
  const raw = readFileSync(ontologyPath, 'utf-8');

  // Strip JS-style comments — must be string-aware to avoid stripping // inside URL values.
  const stripped = stripJsonComments(raw);
  const data: OntologyData = JSON.parse(stripped);

  return new ResolvedOntology(data);
}

// ── ResolvedOntology ──────────────────────────────────────────────────────────

export class ResolvedOntology {
  readonly version: string;
  readonly publishedAt: string;

  private readonly skillById:           Map<string, OntologySkill>;
  private readonly synonymIndex:        Map<string, string>;     // synonym → canonical id
  private readonly transfersBySource:   Map<string, TransferRelationship[]>;
  private readonly transfersByTarget:   Map<string, TransferRelationship[]>;

  constructor(data: OntologyData) {
    this.version     = data.version;
    this.publishedAt = data.published_at;

    this.skillById         = new Map();
    this.synonymIndex      = new Map();
    this.transfersBySource = new Map();
    this.transfersByTarget = new Map();

    // Index skills
    for (const skill of data.skills) {
      this.skillById.set(skill.id, skill);
      // Each skill is its own synonym (canonical lookup)
      this.synonymIndex.set(skill.id, skill.id);
      for (const syn of skill.synonyms) {
        this.synonymIndex.set(syn, skill.id);
      }
    }

    // Index transfers
    for (const rel of data.transfer_relationships) {
      if (!this.transfersBySource.has(rel.source)) {
        this.transfersBySource.set(rel.source, []);
      }
      this.transfersBySource.get(rel.source)!.push(rel);

      if (!this.transfersByTarget.has(rel.target)) {
        this.transfersByTarget.set(rel.target, []);
      }
      this.transfersByTarget.get(rel.target)!.push(rel);
    }
  }

  /** Check if a skill ID exists in the ontology (also accepts synonyms) */
  exists(skillId: string): boolean {
    return this.synonymIndex.has(skillId);
  }

  /**
   * Resolve a skill ID to its canonical form.
   * Accepts both canonical IDs and synonyms.
   * Throws UnknownSkillError if not found.
   */
  resolve(skillId: string): OntologySkill {
    const canonicalId = this.synonymIndex.get(skillId);
    if (!canonicalId) throw new UnknownSkillError(skillId);
    const skill = this.skillById.get(canonicalId);
    if (!skill) throw new UnknownSkillError(skillId);
    return skill;
  }

  /**
   * Get all synonyms for a skill ID (includes the canonical ID itself).
   * Used in Stage 2 semantic expansion.
   */
  getSynonyms(skillId: string): string[] {
    const skill = this.resolve(skillId);
    return [skill.id, ...skill.synonyms];
  }

  /**
   * Find the best match for a skill among a candidate's declared skills,
   * considering synonyms. Returns the matched skill ID and proficiency, or null.
   *
   * This is used throughout the pipeline to handle synonym resolution.
   */
  findBestCandidateMatch(
    candidateSkills: Array<{ ontology_id: string; proficiency: string }>,
    targetSkillId: string,
    additionalSynonyms: string[] = [],
  ): { ontology_id: string; proficiency: string } | null {
    const targetCanonical  = this.synonymIndex.get(targetSkillId) ?? targetSkillId;
    const allSynonyms      = new Set([
      targetSkillId,
      targetCanonical,
      ...additionalSynonyms,
      ...(this.skillById.get(targetCanonical)?.synonyms ?? []),
    ]);

    for (const candidateSkill of candidateSkills) {
      const candidateCanonical = this.synonymIndex.get(candidateSkill.ontology_id)
                               ?? candidateSkill.ontology_id;
      if (
        allSynonyms.has(candidateSkill.ontology_id) ||
        allSynonyms.has(candidateCanonical)
      ) {
        return candidateSkill;
      }
    }
    return null;
  }

  /**
   * Get all transfer relationships where the given skill is the source.
   * Used in Stage 5 transferable skill compensation.
   */
  getTransferSources(targetSkillId: string): TransferRelationship[] {
    const canonical = this.synonymIndex.get(targetSkillId) ?? targetSkillId;
    return this.transfersByTarget.get(canonical) ?? [];
  }

  /**
   * Get all transfer relationships where the given skill is the target.
   */
  getTransferTargets(sourceSkillId: string): TransferRelationship[] {
    const canonical = this.synonymIndex.get(sourceSkillId) ?? sourceSkillId;
    return this.transfersBySource.get(canonical) ?? [];
  }

  /** Return all skills in a given domain */
  getSkillsByDomain(domainId: string): OntologySkill[] {
    return Array.from(this.skillById.values()).filter(s => s.domain === domainId);
  }

  /** Return all skills with a given tag */
  getSkillsByTag(tag: string): OntologySkill[] {
    return Array.from(this.skillById.values()).filter(s => s.tags.includes(tag));
  }

  get skillCount(): number {
    return this.skillById.size;
  }

  get transferCount(): number {
    let n = 0;
    for (const rels of this.transfersBySource.values()) n += rels.length;
    return n;
  }
}
