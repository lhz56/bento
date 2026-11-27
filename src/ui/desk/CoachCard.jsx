// What your edit did: after you change the code and ask, your AI reads the change (and what it printed) and says
// what's different now, with the word for it.
import Md from '../Md.jsx';

export default function CoachCard({ coach, setCoach }) {
  return (
    <div className="coach">
      {coach.loading ? (
        <>
          <span className="dots">
            <i />
            <i />
            <i />
          </span>
          reading your change…
        </>
      ) : (
        <>
          <span className="coach-ic">✦</span>
          <span className="coach-t">
            <Md text={coach.said} />
            {coach.term && coach.plain && (
              <span className="coach-term">
                <b>{coach.term}</b>: {coach.plain}
              </span>
            )}
          </span>
          <button className="ib" aria-label="Dismiss" onClick={() => setCoach(null)}>
            ✕
          </button>
        </>
      )}
    </div>
  );
}
