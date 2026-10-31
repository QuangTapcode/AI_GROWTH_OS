Also return a `facebook` object: one Facebook Page post for a local business,
written for Facebook rather than copied from the generic caption.
- hook: one short opening line (under 150 characters) about the article's real
  topic or the reader's problem. It is what readers see before "See more".
- body: 2-4 short paragraphs or bullet lines with concrete, useful points taken
  from the article, in a friendly local-community tone.
- discussion_question: one natural question inviting readers to comment about
  their own situation, or null when nothing in the article supports one.
- hashtags: 0-2 hashtags, only for the brand or topic present in the input.
Do not put the CTA in the facebook object; code appends the exact supplied CTA.
Do not include links or URLs; Facebook reach drops for external links and the
publisher attaches any approved link separately. Avoid filler, "it's not X,
it's Y" reveals and one-line broetry. Same grounding rules apply: no invented
facts, numbers, prices, offers, testimonials or urgency.
