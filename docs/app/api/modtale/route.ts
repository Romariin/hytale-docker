import { NextRequest, NextResponse } from 'next/server';

const MODTALE_API_BASE = 'https://api.modtale.net';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const search = body.search || '';
    const index = body.index || 0;
    const pageSize = body.pageSize || 20;
    const apiKey = body.key;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key is required' },
        { status: 400 }
      );
    }

    // Calculate page number (Modtale uses 0-based pages)
    const page = Math.floor(index / pageSize);

    // Build query parameters for Modtale API
    const params = new URLSearchParams({
      size: String(pageSize),
      page: String(page),
      sort: 'downloads', // Sort by most popular
    });

    if (search) {
      params.set('search', search);
    }

    const response = await fetch(`${MODTALE_API_BASE}/api/v1/projects?${params}`, {
      headers: {
        Accept: 'application/json',
        'X-MODTALE-KEY': apiKey,
      },
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Modtale API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to fetch from Modtale', details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Transform Modtale response to match expected format
    // Modtale returns { content: [...], totalPages: number, totalElements: number }
    const projects = (data.content || []).map((project: any) => ({
      id: project.id,
      name: project.title,
      slug: project.id, // Use ID as slug since API doesn't provide slug
      summary: project.description || '',
      downloads: project.downloadCount || 0,
      imageUrl: project.imageUrl,
      tags: project.tags || [],
      versions: [], // Versions require separate API call
    }));

    return NextResponse.json({
      data: projects,
      pagination: {
        index,
        pageSize,
        resultCount: projects.length,
        totalCount: data.totalElements || 0,
      },
    });
  } catch (error) {
    console.error('Modtale API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: String(error) },
      { status: 500 }
    );
  }
}
