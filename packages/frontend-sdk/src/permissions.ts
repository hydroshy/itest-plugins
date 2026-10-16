import { FrontendPermissionRequirement } from './types.js';

export class PermissionHelper {
  static checkPermissions(
    userPermissions: string[],
    userRoles: string[],
    requirement?: FrontendPermissionRequirement | string[] | string
  ): boolean {
    if (!requirement) return true;

    // Superadmin bypass
    if (userRoles.includes('admin') || userRoles.includes('superadmin') || userPermissions.includes('*')) {
      return true;
    }

    if (typeof requirement === 'string') {
      return userPermissions.includes(requirement);
    }

    if (Array.isArray(requirement)) {
      if (requirement.length === 0) return true;
      return requirement.every((perm) => userPermissions.includes(perm));
    }

    // Role check if specified
    if (requirement.roles && requirement.roles.length > 0) {
      const hasRole = requirement.roles.some((role) => userRoles.includes(role));
      if (!hasRole) return false;
    }

    // Permission check
    if (requirement.permissions && requirement.permissions.length > 0) {
      const matchMode = requirement.matchMode || 'all';
      if (matchMode === 'any') {
        return requirement.permissions.some((perm) => userPermissions.includes(perm));
      } else {
        return requirement.permissions.every((perm) => userPermissions.includes(perm));
      }
    }

    return true;
  }
}
