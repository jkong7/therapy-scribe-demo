/* Fictional sample session. Not a real person, not a real therapist. */
(function (root) {
  'use strict';

  var SAMPLE_TRANSCRIPT = [
    'Therapist: Welcome back, Sam. How has the week been since we last met?',
    'Client: Honestly pretty rough. I have been sleeping maybe four hours a night.',
    'Therapist: Four hours. What happens when you try to fall asleep?',
    'Client: My mind just races about work. My manager moved the deadline up and I keep replaying meetings.',
    'Therapist: It sounds like the worry about work follows you into the night.',
    'Client: Yeah. I would say my anxiety has been about a 7 out of 10 most days.',
    'Client: I have also been skipping meals because I feel too wound up to eat.',
    'Therapist: Let\'s slow down for a moment. What goes through your mind when you replay those meetings?',
    'Client: That I am going to get fired and let my family down.',
    'Therapist: When you notice that thought, what is the evidence for and against it?',
    'Client: I mean, my last review was good. So probably not fired. It just feels true at 2am.',
    'Client: Sometimes I think everyone would be better off without me.',
    'Therapist: Thank you for telling me that. I want to understand more about what you mean.',
    'Client: It is more that I feel like a burden. I talked to my sister about it on Sunday and that helped a bit.',
    'Therapist: For this week, could you try writing down the racing thoughts in a log before bed?',
    'Client: I can try that.',
    'Therapist: Good. Let\'s plan to see you next week, same time on Thursday.'
  ].join('\n');

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SAMPLE_TRANSCRIPT: SAMPLE_TRANSCRIPT };
  } else {
    root.TherapySample = { SAMPLE_TRANSCRIPT: SAMPLE_TRANSCRIPT };
  }
})(this);
