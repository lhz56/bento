// A lesson with several files: one tab per file, and adding, renaming and removing them.

export default function FileTabs({ addFile, fi, filesRef, lang, lesson, openFile, removeFile }) {
  return (
    <div className="desk-files">
      {(
        filesRef.current || [
          { name: lesson.file || (lang === 'python' ? 'main.py' : 'index.html') },
        ]
      ).map((file, i) => (
        <button
          key={file.name + i}
          className={`df-tab ${i === fi ? 'on' : ''}`}
          onClick={() => openFile(i)}
          title={i === 0 ? 'This file runs; the others are used by it' : file.name}
        >
          {i === 0 && <span className="df-main">▶</span>}
          {file.name}
          {i > 0 && (
            <span
              className="df-x"
              onClick={(e) => {
                e.stopPropagation();
                removeFile(i);
              }}
              aria-label="Remove file"
            >
              ×
            </span>
          )}
        </button>
      ))}
      <button className="df-add" onClick={addFile} title="Add a file to this project">
        + file
      </button>
    </div>
  );
}
