// A lesson with several files (a small project): which one is open, and adding, renaming and removing files.
// projectBundle gives the runner the main file plus the others.
import { useRef, useState } from 'react';

export default function useDeskFiles({ codeRef, edited, lang, lesson, onPatch, setCode }) {
  // input(): the learner's answers so far, and a random seed kept while answering so a re-run replays the same game
  // projects: several files, one open at a time (files[0] is the one that runs)
  const multi = Array.isArray(lesson.files) && lesson.files.length > 0;
  const filesRef = useRef(lesson.files || null);
  const [fi, setFi] = useState(0);
  const [, bumpFiles] = useState(0);
  const fiRef = useRef(0);
  fiRef.current = fi; // memoised callbacks read the open file through this
  // a project runs as one thing: a web page gets its CSS and JS files stitched in; Python gets the other files next to it
  const projectBundle = (src) => {
    const fs = filesRef.current;
    if (!fs?.length) return { main: src, files: null };
    const all = fs.map((f, i) => (i === fiRef.current ? { ...f, code: src } : f));
    if (lang === 'html') {
      let main = all[0].code;
      const extra = [];
      for (const file of all.slice(1)) {
        const escaped = file.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (
          /\.css$/.test(file.name) &&
          new RegExp(`<link[^>]+href=["']\\.?/?${escaped}["'][^>]*>`, 'i').test(main)
        ) {
          main = main.replace(new RegExp(`<link[^>]+href=["']\\.?/?${escaped}["'][^>]*>`, 'i'), '');
          extra.push(`<style>\n${file.code}\n</style>`);
        }
        if (
          /\.js$/.test(file.name) &&
          new RegExp(`<script[^>]+src=["']\\.?/?${escaped}["'][^>]*>\\s*</script>`, 'i').test(main)
        ) {
          main = main.replace(
            new RegExp(`<script[^>]+src=["']\\.?/?${escaped}["'][^>]*>\\s*</script>`, 'i'),
            '',
          );
          extra.push(`<script>\n${file.code}\n</script>`);
        }
      }
      return { main: `${main}\n${extra.join('\n')}`, files: null }; // added at the end, so index.html keeps its line numbers
    }
    return { main: all[0].code, files: all.slice(1).map((f) => ({ name: f.name, code: f.code })) };
  };
  const openFile = (i) => {
    if (!filesRef.current) return;
    filesRef.current = filesRef.current.map((f, k) =>
      k === fi ? { ...f, code: codeRef.current } : f,
    );
    setFi(i);
    setCode(filesRef.current[i].code);
    edited.current = true;
  };
  const addFile = () => {
    const web = lang === 'html';
    const have = filesRef.current || [
      {
        name: lesson.file || (lang === 'python' ? 'main.py' : 'index.html'),
        code: codeRef.current,
      },
    ];
    const names = web
      ? ['style.css', 'script.js', 'page2.html', 'more.css']
      : ['helpers.py', 'data.py', 'utils.py', 'module4.py'];
    const name =
      names.find((n) => !have.some((f) => f.name === n)) ||
      `file${have.length + 1}${web ? '.js' : '.py'}`;
    const starter = name.endsWith('.css')
      ? '/* styles for your page */\nh1 { color: tomato; }\n'
      : name.endsWith('.js')
        ? '// code for your page\ndocument.querySelector("h1").addEventListener("click", () => alert("hi!"));\n'
        : name.endsWith('.py')
          ? `# ${name}: import it from ${have[0].name} with: from ${name.slice(0, -3)} import greet\ndef greet(who):\n    return f"Hello, {who}!"\n`
          : '<!doctype html>\n<h1>Another page</h1>\n';
    let files = [
      ...have.map((f, i) => (i === fi ? { ...f, code: codeRef.current } : f)),
      { name, code: starter },
    ];
    // link new CSS/JS files into the page so they work straight away
    if (web && /\.(css|js)$/.test(name)) {
      const tag = name.endsWith('.css')
        ? `<link rel="stylesheet" href="${name}">`
        : `<script src="${name}"></script>`;
      const m = files[0].code;
      files[0] = {
        ...files[0],
        code: /<\/body>/i.test(m) ? m.replace(/<\/body>/i, `  ${tag}\n</body>`) : `${m}\n${tag}`,
      };
    }
    filesRef.current = files;
    onPatch({ files });
    setFi(files.length - 1);
    setCode(starter);
    bumpFiles((x) => x + 1);
  };
  const removeFile = (i) => {
    if (!filesRef.current || i === 0) return;
    const files = filesRef.current.filter((_, k) => k !== i);
    filesRef.current = files;
    onPatch({ files });
    setFi(0);
    setCode(files[0].code);
  };
  return { addFile, fi, filesRef, multi, openFile, projectBundle, removeFile, setFi };
}
