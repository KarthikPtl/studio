"use client";

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import Image from 'next/image';
import { UploadCloud, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface ImageUploaderProps {
  onImageUpload: (file: File) => void;
  imageUrl: string | null;
  setImageUrl: (url: string | null) => void;
  setFile: (file: File | null) => void;
  className?: string; // Added className prop
}

export function ImageUploader({ onImageUpload, imageUrl, setImageUrl, setFile, className }: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      setIsDragging(false);
      if (acceptedFiles && acceptedFiles.length > 0) {
        const file = acceptedFiles[0];
        // Clean up previous blob URL if exists
        if (imageUrl && imageUrl.startsWith('blob:')) {
            URL.revokeObjectURL(imageUrl);
        }
        const newImageUrl = URL.createObjectURL(file); // Create temporary URL for preview
        setImageUrl(newImageUrl);
        setFile(file);
        onImageUpload(file); // Pass the File object directly
      }
    },
    [imageUrl, onImageUpload, setImageUrl, setFile] // Added imageUrl to dependency array
  );

   // Cleanup temporary URL when component unmounts or imageUrl is explicitly cleared
   React.useEffect(() => {
     return () => {
       if (imageUrl && imageUrl.startsWith('blob:')) {
         URL.revokeObjectURL(imageUrl);
       }
     };
   }, [imageUrl]);


  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/jpeg': [], 'image/png': [] },
    multiple: false,
    onDragEnter: () => setIsDragging(true),
    onDragLeave: () => setIsDragging(false),
  });

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the dropzone click
    if (imageUrl && imageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(imageUrl); // Clean up blob URL
    }
    setImageUrl(null);
    setFile(null);
    // Optionally call a prop function to notify parent about clearing
    // onImageClear?.();
  };

  return (
    // Increased radius, subtle hover effect
    <Card className={cn("border-2 border-dashed hover:border-primary/80 transition-colors h-full rounded-xl", isDragging || isDragActive ? "border-primary bg-primary/5" : "border-border/70", className)}>
      <CardContent
        {...getRootProps()}
        className={cn("relative flex flex-col items-center justify-center p-6 min-h-[200px] cursor-pointer text-center h-full rounded-xl")} // Added rounded-xl
      >
        <input {...getInputProps()} />
        {imageUrl ? (
          <>
            <Image
              src={imageUrl}
              alt="Uploaded Math Expression"
              width={400}
              height={200}
              className="max-h-[300px] w-auto object-contain rounded-lg shadow-md" // Increased radius, added shadow
              data-ai-hint="math equation"
            />
             {/* Refined clear button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClear}
              className="absolute top-3 right-3 bg-background/80 hover:bg-destructive/10 hover:text-destructive rounded-full z-10 h-7 w-7" // Smaller, adjusted position, destructive hover
              aria-label="Clear image"
            >
              <X className="h-4 w-4" />
            </Button>
            <p className="mt-4 text-sm text-muted-foreground">Drag 'n' drop or click to replace</p>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <UploadCloud className="h-10 w-10 text-gray-400" /> {/* Adjusted icon size/color */}
            <p className="font-medium text-sm text-foreground"> {/* Adjusted text */}
              {isDragActive ? "Drop the image here..." : "Drag & drop image, or click to select"}
            </p>
            <p className="text-xs text-gray-500">Supports JPG, PNG (Max 5MB)</p> {/* Added size hint */}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
