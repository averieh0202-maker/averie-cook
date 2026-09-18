import { copy } from "./copy";

/** Homepage cards hide the 1–10 picker after this visitor has already scored. */
export function homepageRatingState(myScore: number | null | undefined): {
  showPicker: boolean;
  caption: string;
} {
  if (myScore == null) {
    return { showPicker: true, caption: copy.rating.pick };
  }
  return { showPicker: false, caption: copy.rating.yoursShort(myScore) };
}
