/**
 * Purpose: Friendly names for the generated API schema types.
 * Scope: Type aliases only, so feature code never spells out `components['schemas'][...]`.
 * Does NOT belong: Runtime code.
 */
import type { components } from './schema.gen';

type Schemas = components['schemas'];

export type DocumentSummary = Schemas['DocumentSummary'];
export type DocumentDetail = Schemas['DocumentDetail'];
export type ReadingProgress = Schemas['ReadingProgress'];
export type SectionOut = Schemas['SectionOut'];
export type SectionContent = Schemas['SectionContent'];
export type SegmentOut = Schemas['SegmentOut'];
export type VoiceInfo = Schemas['VoiceInfo'];
export type EngineInfo = Schemas['EngineInfo'];
export type InstallOption = Schemas['InstallOption'];
export type JobOut = Schemas['JobOut'];
export type Preferences = Schemas['Preferences'];
export type SystemInfo = Schemas['SystemInfo'];
export type VoiceProfile = Schemas['VoiceProfileOut'];
export type QualityReport = Schemas['QualityReport'];
export type Delivery = VoiceProfile['delivery'];
export type VoiceSession = Schemas['VoiceSessionOut'];
export type RecordingCheck = Schemas['RecordingCheck'];
export type Cleanup = Schemas['Cleanup'];
export type SessionTake = Schemas['TakeOut'];
export type ExportRequest = Schemas['ExportRequest'];
