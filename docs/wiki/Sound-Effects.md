# Sound effects

Sound effects are an optional layer beside the narration: a creaking door, distant thunder, rain
under a scene. They are **off at the start of every narration**, and nothing plays until you turn
them on in the reader's **Sounds** tab. Everything happens on your computer; no text leaves it.

## Turning them on

Open a document and choose the **Sounds** tab in the side panel (on a phone, open **Contents** and
pick **Sounds**). The switch at the top turns effects on for this narration only: opening another
document, or reaching the end, turns them off again. The **volume** and the **intensity** (Minimal,
Balanced or Immersive) are remembered on this device.

Effects never change the narration: they play on a separate audio path with their own volume and a
limiter, so a loud effect cannot clip or drown the voice. If a sound fails to load, it is skipped and
the narration carries on.

## Suggestions

**Analyse this chapter** looks at the chapter you are viewing and suggests effects where the text
describes a sound that is really happening: "the door creaked open", "thunder rumbled", "rain
pattered on the roof". Metaphors ("a storm of emotions"), memories, questions, habits and things
characters merely say are left alone, and the setting keeps suggestions few and spaced out. A false
effect is worse than a missed one, so a quiet chapter often gets none.

Each suggestion shows its sentence, the sound chosen, where in the sentence it falls, and buttons to
**Preview**, **Accept**, **Dismiss** or **Replace** the sound. Nothing plays until you accept it. A
dismissed suggestion does not come back when you analyse the chapter again; accepted ones and the
effects you added yourself are never touched by a new analysis.

The analysis uses word rules on your computer, not a language model, and the text of a document is
only ever data to it: instructions written inside a book cannot make TTSNative do anything.

## Adding and adjusting effects

**Add an effect** opens the sound library: browse by category, search by a word (rain, door, bell),
preview, and choose **Use** to place it at the sentence being read (or, when the narration isn't on
this document, the first sentence of the chapter). An ambience such as rain plays under the next few
sentences; a one-shot such as a knock plays once.

Each placed effect can be turned off and on, **adjusted** (at the start or the end of its sentence,
with a delay, its own volume, and for ambience how many sentences it lasts), **replaced** with
another sound, or **removed**. Sentences that carry an effect are tinted in the text, and clicking
an effect's sentence in the panel jumps to it.

## Timing

Narration is read one sentence at a time, so an effect lands exactly at the start or end of its
sentence. A position inside a sentence is an estimate from where the words fall in the text, usually
within half a second. Seeking, pausing, changing speed or voice and skipping chapters all keep
effects in step: an effect whose moment has passed is skipped rather than played late, and an
ambience stops when you leave its sentences and starts again when you return.

## The sounds

The bundled library has 36 sounds across weather, nature, animals, doors, footsteps, household,
fantasy, impacts, vehicles, atmosphere and machines. Every one was synthesised from a recipe in the
repository, so there are no recordings and nothing to license beyond the project's MIT licence;
`apps/web/public/sfx/CREDITS.md` lists them. Importing your own sounds is not supported yet.

## Where your arrangement lives

Effects, your choices about suggestions and the analysis record are stored with the document in
TTSNative's database on your computer, and deleted with the document. Nothing is written into the
original file. If a sentence's text changes (for example after a section correction), its effect is
shown with a warning and not played until you place it again.

Exported audio does not include sound effects yet.
