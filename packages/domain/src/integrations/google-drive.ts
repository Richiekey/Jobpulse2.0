/**
 * Low-level Google Drive API client for listing folders and files.
 * Uses the existing OAuth access token and fetchFn pattern.
 */

export interface GoogleDriveFolder {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
}

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime?: string;
  webViewLink?: string;
}

const GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3/files';

/**
 * Lists all non-trashed folders accessible to the authenticated user.
 * Used by the UI to populate the "Resume Drive Folder" dropdown.
 */
export async function listDriveFolders(
  accessToken: string,
  fetchFn: typeof fetch = fetch
): Promise<GoogleDriveFolder[]> {
  const query = encodeURIComponent(
    "mimeType='application/vnd.google-apps.folder' and trashed=false"
  );
  const fields = encodeURIComponent('files(id,name,mimeType,modifiedTime)');
  const url = `${GOOGLE_DRIVE_API}?q=${query}&fields=${fields}&pageSize=100&orderBy=name`;

  const response = await fetchFn(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `Google Drive listDriveFolders failed (${response.status}): ${errText}`
    );
  }

  const data = (await response.json()) as { files?: GoogleDriveFolder[] };
  return data.files || [];
}

/**
 * Lists all non-trashed files within a specific Drive folder.
 * Returns file metadata including webViewLink for resume URL population.
 */
export async function listFilesInFolder(
  accessToken: string,
  folderId: string,
  fetchFn: typeof fetch = fetch
): Promise<GoogleDriveFile[]> {
  const query = encodeURIComponent(
    `'${folderId}' in parents and trashed=false`
  );
  const fields = encodeURIComponent(
    'files(id,name,mimeType,modifiedTime,webViewLink)'
  );
  const url = `${GOOGLE_DRIVE_API}?q=${query}&fields=${fields}&pageSize=200&orderBy=modifiedTime desc`;

  const response = await fetchFn(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `Google Drive listFilesInFolder failed (${response.status}): ${errText}`
    );
  }

  const data = (await response.json()) as { files?: GoogleDriveFile[] };
  return data.files || [];
}
