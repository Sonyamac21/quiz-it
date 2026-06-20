path = "app/host/questions/page.tsx"
with open(path, "r") as f:
    content = f.read()

old = '''      if (q && q.question_type === "audio" && q.option_a) {
        try {
          const ytKey = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
          const ytRes = await fetch(
            "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=" +
            encodeURIComponent(q.option_a) + "&key=" + ytKey
          );
          const ytData = await ytRes.json();
          const videoId = ytData?.items?.[0]?.id?.videoId;
          if (videoId) q.option_b = "https://www.youtube.com/watch?v=" + videoId;
        } catch {}
      }
      if (q && q.question_type === "picture" && q.option_a) {
        try {
          const pixabayKey = process.env.NEXT_PUBLIC_PIXABAY_API_KEY;
          const pixRes = await fetch(
            "https://pixabay.com/api/?key=" + pixabayKey +
            "&q=" + encodeURIComponent(q.option_a) +
            "&image_type=photo&per_page=5&safesearch=true"
          );
          const pixData = await pixRes.json();
          const hit = pixData?.hits?.[0];
          if (hit) q.option_b = hit.largeImageURL || hit.webformatURL;
        } catch {}
      }
      return q;'''

new = '''      if (q && q.question_type === "audio" && q.option_a) {
        try {
          const ytKey = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
          const ytRes = await fetch(
            "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=" +
            encodeURIComponent(q.option_a) + "&key=" + ytKey
          );
          const ytData = await ytRes.json();
          const videoId = ytData?.items?.[0]?.id?.videoId;
          if (videoId) { q.option_b = "https://www.youtube.com/watch?v=" + videoId; } else { return null; }
        } catch { return null; }
      }
      if (q && q.question_type === "picture" && q.option_a) {
        try {
          const pixabayKey = process.env.NEXT_PUBLIC_PIXABAY_API_KEY;
          const pixRes = await fetch(
            "https://pixabay.com/api/?key=" + pixabayKey +
            "&q=" + encodeURIComponent(q.option_a) +
            "&image_type=photo&per_page=5&safesearch=true"
          );
          const pixData = await pixRes.json();
          const hit = pixData?.hits?.[0];
          if (hit) { q.option_b = hit.largeImageURL || hit.webformatURL; } else { return null; }
        } catch { return null; }
      }
      return q;'''

count = content.count(old)
print("occurrences found:", count)
content = content.replace(old, new)

with open(path, "w") as f:
    f.write(content)
