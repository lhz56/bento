// An error from the main process reads "Error invoking remote method 'ask': Error: …". This keeps only the part
// meant for the learner.
/** @param {unknown} err */
export const cleanErr = (err) =>
  String(/** @type {any} */ (err)?.message || err).replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    '',
  );
