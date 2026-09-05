import httpStatus from "http-status";
import { prisma } from "../../lib/prisma";
import { UploadApiResponse } from "cloudinary";
import { cloudinary } from "../../lib/cloudinary";
import { AppError } from "../../utils/AppError";

const uploadProfileImage = async (buffer: Buffer, userId: string) => {
  const currentUser = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      imagePublicId: true,
      imageUrl: true,
    },
  });

  const cloudinaryResult = await new Promise<UploadApiResponse>(
    (resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            resource_type: "auto",
          },

          async (error, result) => {
            if (error) {
              if ((error as any).http_code === 403) {
                return reject(
                  new AppError(
                    httpStatus.FORBIDDEN,
                    "Cloudinary authentication failed. Please check your Cloudinary API credentials.",
                  ),
                );
              }
              return reject(error);
            }

            if (!result) {
              return reject(new Error("No result returned from Cloudinary"));
            }

            resolve(result);
          },
        )
        .end(buffer);
    },
  );

  const updatedUser = await prisma.user.update({
    where: {
      id: userId,
    },

    data: {
      imageUrl: cloudinaryResult.secure_url,
      imagePublicId: cloudinaryResult.public_id,
    },

    omit: {
      password: true,
    },
  });

  if (currentUser?.imagePublicId && currentUser.imageUrl) {
    await cloudinary.uploader.destroy(currentUser.imagePublicId);
  }

  return updatedUser;
};

const deleteUserByID = async (userId: string) => {
  const userExist = await prisma.user.findUnique({
    where: {
      id: userId,
    },
  });

  if (!userExist) {
    throw new AppError(httpStatus.NOT_FOUND, "User Not Found");
  }

  if (userExist.deletedAt) {
    throw new AppError(httpStatus.NOT_FOUND, "User Already Deleted");
  }

  const deletedUser = await prisma.user.update({
    where: {
      id: userExist.id,
    },

    data: {
      deletedAt: new Date(),
    },
  });

  return deletedUser;
};
export const UserServices = {
  uploadProfileImage,
  deleteUserByID,
};
