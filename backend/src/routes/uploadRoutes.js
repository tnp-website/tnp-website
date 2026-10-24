import { getSessionToken } from "../utils/cookies.js";
import { getUserFromSession } from "../services/authService.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export async function handleUploadRoute(request, env) {
  const url = new URL(request.url);

  if (
    request.method !== "POST" ||
    url.pathname !== "/api/uploads/news-image"
  ) {
    return null;
  }

  // =========================
  // AUTHENTICATION
  // =========================

  const sessionToken = getSessionToken(request);

  if (!sessionToken) {
    return Response.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  const user = await getUserFromSession(env, sessionToken);

  if (!user) {
    return Response.json(
      { error: "Invalid or expired session" },
      { status: 401 }
    );
  }

  // =========================
  // AUTHORIZATION
  // =========================

  if (user.role !== "admin" && user.role !== "editor") {
    return Response.json(
      { error: "You do not have permission to upload images" },
      { status: 403 }
    );
  }

  // =========================
  // READ FORM DATA
  // =========================

  let formData;

  try {
    formData = await request.formData();
  } catch {
    return Response.json(
      { error: "Invalid multipart form data" },
      { status: 400 }
    );
  }

  const file = formData.get("image");

  if (!(file instanceof File)) {
    return Response.json(
      { error: "No image was provided" },
      { status: 400 }
    );
  }

  // =========================
  // VALIDATE FILE
  // =========================

  if (!ALLOWED_TYPES.has(file.type)) {
    return Response.json(
      {
        error:
          "Only JPEG, PNG, WebP, and GIF images are allowed",
      },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return Response.json(
      {
        error: "Image must be 10 MB or smaller",
      },
      { status: 400 }
    );
  }

  // =========================
  // GENERATE STORAGE PATH
  // =========================

  const extension =
    file.name.split(".").pop()?.toLowerCase() || "jpg";

  const fileName = `${crypto.randomUUID()}.${extension}`;

  const filePath = `news/${fileName}`;

  // =========================
  // UPLOAD TO SUPABASE
  // =========================

  const fileBuffer = await file.arrayBuffer();

  const uploadResponse = await fetch(
    `${env.SUPABASE_URL}/storage/v1/object/tnp-images/${filePath}`,
    {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SECRET_KEY,
        "Content-Type": file.type,
        "x-upsert": "false",
      },
      body: fileBuffer,
    }
  );

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();

    console.error(
      "Supabase image upload failed:",
      errorText
    );

    return Response.json(
      { error: "Failed to upload image" },
      { status: 500 }
    );
  }

  // =========================
  // PUBLIC IMAGE URL
  // =========================

  const imageUrl =
    `${env.SUPABASE_URL}/storage/v1/object/public/tnp-images/${filePath}`;

  return Response.json({
    image: imageUrl,
  });
}
