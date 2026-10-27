import type { RoleSettingsDto } from '../../orchestration/application/dto/role-settings.dto.js';
import { SURVEY_SCHEMA } from '../../orchestration/application/dto/schemas.js';
import type { ProgressPort, TeamMemberPort } from '../../orchestration/application/ports.js';
import { DomainError } from '../../shared/domain-error.js';
import { areaOf, RepoKnowledge } from '../domain/repo-knowledge.js';
import type { RepoRef } from '../domain/repo-ref.js';
import { SurveyReportDto } from './dto/survey-report.dto.js';
import type { KnowledgePort, KnowledgeStorePort, RepoReaderPort } from './ports.js';

/** 조사 팀원 한 번에 맡기는 영역 수와 영역마다 보여 주는 파일 수. 남은 영역은 다음 호출에서 한다. */
const AREAS_PER_SURVEY = 15;
const FILES_PER_AREA = 40;

export interface KnowledgeServiceDeps {
  readonly reader: RepoReaderPort;
  readonly store: KnowledgeStorePort;
  readonly team: TeamMemberPort;
  readonly roles: RoleSettingsDto;
  readonly progress: ProgressPort;
  /** 지식 묶음에 쓸 저장소 이름 */
  readonly repoName: string;
}

/**
 * 저장소 지식을 쓰기 직전에 최신으로 맞춘다: 불러오기 → git으로 바뀐 파일 → 엔티티가 낡은 영역 판정
 * → 낡은 영역만 조사 팀원(haiku)이 다시 쓰기 → 저장. 바뀐 게 없으면 모델도 저장도 하지 않는다.
 */
export class KnowledgeService implements KnowledgePort {
  constructor(private readonly deps: KnowledgeServiceDeps) {}

  async current(): Promise<{ block: string; basis: RepoRef } | null> {
    const { reader, store } = this.deps;
    const ref = await reader.current();
    if (ref === null) return null;
    const loaded = await store.load();
    const refreshed = loaded === null ? null : await this.followChanges(loaded, ref);
    const knowledge = refreshed ?? (await this.build(ref));
    const surveyed = await this.survey(knowledge);
    if (loaded === null || refreshed !== loaded || surveyed || knowledge.basis !== loaded.basis) await store.save(knowledge);
    return { block: knowledge.toBlock(this.deps.repoName), basis: knowledge.basis };
  }

  async noteChanged(paths: readonly string[]): Promise<void> {
    const { reader, store } = this.deps;
    const [ref, knowledge] = await Promise.all([reader.current(), store.load()]);
    if (ref === null || knowledge === null) return;
    knowledge.applyChanges({ basis: ref, facts: await reader.facts(await reader.files()), changed: await reader.symbolsOf(paths) });
    await store.save(knowledge);
  }

  /** 기준 이후 바뀐 파일을 반영한 지식. 바뀐 게 없으면 그대로, 다시 만들어야 하면 null. */
  private async followChanges(knowledge: RepoKnowledge, ref: RepoRef): Promise<RepoKnowledge | null> {
    const same = knowledge.basis.commit === ref.commit && !ref.dirty && !knowledge.basis.dirty;
    if (same) return knowledge;
    const changed = await this.deps.reader.changedSince(knowledge.basis);
    if (changed === 'rebuild' || knowledge.needsRebuild(changed.paths.length)) return null;
    const files = await this.deps.reader.files();
    knowledge.applyChanges({ basis: ref, facts: await this.deps.reader.facts(files), changed: await this.deps.reader.symbolsOf(changed.paths) });
    return knowledge;
  }

  private async build(ref: RepoRef): Promise<RepoKnowledge> {
    this.deps.progress.step('저장소를 처음 파악하는 중이에요');
    const files = await this.deps.reader.files();
    const symbols = await this.deps.reader.symbolsOf(files);
    const exported = new Map([...symbols].filter((e): e is [string, readonly string[]] => e[1] !== null && e[1].length > 0));
    return RepoKnowledge.create({ basis: ref, facts: await this.deps.reader.facts(files), symbols: exported, files });
  }

  /** 낡은 영역 메모를 조사 팀원에게 맡긴다. 막히거나 실패하면 메모 없이 둔다(다음에 다시). 메모를 썼으면 true. */
  private async survey(knowledge: RepoKnowledge): Promise<boolean> {
    const areas = knowledge.staleAreas().slice(0, AREAS_PER_SURVEY);
    if (areas.length === 0) return false;
    const listing = areas.map((area) => [`## ${area}`, ...knowledge.files.filter((f) => areaOf(f) === area).slice(0, FILES_PER_AREA).map((f) => `- ${f}`)].join('\n'));
    this.deps.progress.step('저장소를 파악하는 중…', 'surveyor');
    const result = await this.deps.team.run({
      role: 'surveyor',
      setting: this.deps.roles.get('surveyor'),
      userMessage: [knowledge.toBlock(this.deps.repoName), `<areas>\n${listing.join('\n\n')}\n</areas>`, '<task>위 영역마다 짧은 메모를 쓰세요. 연 파일만 sources에 넣습니다.</task>'].join('\n\n'),
      outputSchema: SURVEY_SCHEMA,
      canWrite: () => false,
    });
    if (result.blocked || result.output === null) return false;
    try {
      const wanted = new Set(areas);
      knowledge.writeNotes(SurveyReportDto.from(result.output).notes.filter((n) => wanted.has(n.area)));
      return true;
    } catch (error) {
      if (error instanceof DomainError) return false;
      throw error;
    }
  }
}
