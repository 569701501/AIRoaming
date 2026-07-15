import { createRouter, createWebHistory, type RouteLocationRaw } from "vue-router";

export const projectStepRouteMap = {
  script: "project_story",
  characters: "project_characters",
  structure: "story_structure",
  storyboard: "storyboard",
  preflight: "image_preflight",
  candidates: "image_candidates",
  layout: "layout_export",
  assets: "asset_package",
} as const;

export type ProjectStepSlug = keyof typeof projectStepRouteMap;
export type ProjectStepKey = (typeof projectStepRouteMap)[ProjectStepSlug];

const projectStepSlugs = Object.keys(projectStepRouteMap) as ProjectStepSlug[];
const RouteStub = {
  render: () => null,
};

export function getStepKeyFromSlug(slug: string | undefined): ProjectStepKey {
  if (slug && slug in projectStepRouteMap) {
    return projectStepRouteMap[slug as ProjectStepSlug];
  }

  return "project_story";
}

export function getStepSlugFromKey(stepKey: string): ProjectStepSlug {
  const found = projectStepSlugs.find((slug) => projectStepRouteMap[slug] === stepKey);
  return found ?? "script";
}

export function projectRoute(projectId: string, step: ProjectStepSlug = "script", chapterId?: string | null): RouteLocationRaw {
  if (step === "script" && chapterId) {
    return {
      name: "project-script-chapter",
      params: {
        projectId,
        chapterId,
      },
    };
  }

  return {
    name: "project-step",
    params: {
      projectId,
      step,
    },
  };
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      redirect: "/projects",
    },
    {
      path: "/projects",
      name: "projects",
      component: RouteStub,
    },
    {
      path: "/settings",
      name: "settings",
      component: RouteStub,
    },
    {
      path: "/projects/:projectId",
      redirect: (to) => ({
        name: "project-step",
        params: {
          projectId: to.params.projectId,
          step: "script",
        },
      }),
    },
    {
      path: "/projects/:projectId/layout/preview",
      name: "layout-preview",
      component: () => import("../views/LayoutReadOnlyPreviewView.vue"),
    },
    {
      path: "/projects/:projectId/:step(script|characters|structure|storyboard|preflight|candidates|layout|assets)",
      name: "project-step",
      component: RouteStub,
    },
    {
      path: "/projects/:projectId/script/:chapterId",
      name: "project-script-chapter",
      component: RouteStub,
    },
    {
      path: "/:pathMatch(.*)*",
      redirect: "/projects",
    },
  ],
});
