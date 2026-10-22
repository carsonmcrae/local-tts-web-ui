// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
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
export type ExportFormat = ExportRequest['format'];
export type ExportOut = Schemas['ExportOut'];
export type AudiobookDetails = Schemas['DetailsOut'];
export type AudiobookDetailsInput = Schemas['DetailsIn'];
export type ShelfSettings = Schemas['AbsSettingsOut'];
export type ShelfSettingsInput = Schemas['AbsSettingsIn'];
export type ShelfLibrary = Schemas['AbsLibrary'];
export type Pronunciation = Schemas['PronunciationOut'];
export type PronunciationInput = Schemas['PronunciationIn'];
export type Bookmark = Schemas['BookmarkOut'];
export type SearchResults = Schemas['SearchResults'];
export type DocumentStyles = Schemas['DocumentStylesOut'];
export type SentenceStyle = Schemas['SegmentStyleOut'];
export type SentenceStyleChange = Schemas['SegmentStyleUpdate'];
export type SoundEffect = NonNullable<SentenceStyle['effect']>;
export type VoiceSound = NonNullable<SentenceStyle['sound']>;
export type Character = Schemas['CharacterOut'];
export type CharacterAssignment = Schemas['CharacterAssignment'];
export type CastPreset = Schemas['CastPresetOut'];
export type SentenceTake = Schemas['SentenceTakeOut'];
export type SpeakingStyle = NonNullable<SentenceStyle['style']>;
export type Folder = Schemas['FolderOut'];
export type FolderInput = Schemas['FolderIn'];
export type Collection = Schemas['CollectionOut'];
export type CollectionInput = Schemas['CollectionIn'];
type ShelfFacets = Schemas['ShelfFacets'];
export type ShelfUpdate = Schemas['ShelfUpdate'];
export type OrganizeRequest = Schemas['OrganizeRequest'];
export type TagCount = Schemas['TagOut'];
export type BundledWork = Schemas['WorkOut'];
export type Genre = NonNullable<ShelfFacets['genres']>[number];
export type WorkType = NonNullable<ShelfFacets['documentType']>;
export type SpeechApiStatus = Schemas['SpeechApiStatus'];
export type SpeechApiSettingsInput = Schemas['SpeechApiSettingsIn'];
export type SpeechApiToken = Schemas['SpeechApiToken'];
export type SpeechApiActivity = Schemas['SpeechApiActivity'];
export type ReadingPreset = Schemas['ReadingPresetOut'];
export type PresetComponent = Schemas['PresetApplyRequest']['components'][number];
export type SfxLibrary = Schemas['LibraryOut'];
export type SfxSound = Schemas['SoundOut'];
export type SfxEffect = Schemas['EffectOut'];
export type SfxEffectInput = Schemas['EffectIn'];
export type SfxEffectChange = Schemas['EffectUpdate'];
export type SfxDocument = Schemas['DocumentEffectsOut'];
export type SfxAnalysis = Schemas['AnalysisOut'];
export type SfxAnalysisRequest = Schemas['AnalysisIn'];
